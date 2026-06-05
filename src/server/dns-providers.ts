import net from "node:net";
import type {
  CloudflareDnsSettings,
  DnsProviderId,
  DnsProviderSettings,
  DnsSettings,
  NamecheapDnsSettings,
  SpaceshipDnsSettings
} from "./system-settings.js";

export const dnsProviderIds = ["cloudflare", "namecheap", "spaceship"] as const satisfies readonly DnsProviderId[];

const providerNames: Record<DnsProviderId, string> = {
  cloudflare: "Cloudflare",
  namecheap: "Namecheap",
  spaceship: "Spaceship"
};

export type DnsRecordApplyResult = {
  provider: DnsProviderId;
  providerName: string;
  action: "created" | "updated";
  hostname: string;
  recordType: "A";
  host: string;
  zone: string;
  targetIp: string;
};

type DnsRecordInput = {
  hostname: string;
  targetIp: string;
  publicIp: string;
};

type ProviderRequestError = Error & { status?: number };

type CloudflareApiResponse<T> = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result: T;
};

type CloudflareZone = {
  id: string;
  name: string;
};

type CloudflareRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
};

type NamecheapHost = Record<string, string>;

type SpaceshipRecord = {
  type: string;
  name: string;
  address?: string;
  ttl?: number;
  group?: unknown;
  [key: string]: unknown;
};

type SpaceshipRecordsResponse = {
  items?: SpaceshipRecord[];
  total?: number;
};

export function dnsProviderName(provider: DnsProviderId) {
  return providerNames[provider];
}

export function dnsProviderSettings(settings: DnsSettings | null | undefined, provider: DnsProviderId): DnsProviderSettings | null {
  if (!settings) return null;
  if (provider === "cloudflare") return settings.cloudflare ?? null;
  if (provider === "namecheap") return settings.namecheap ?? null;
  return settings.spaceship ?? null;
}

export async function applyDnsProviderARecord(provider: DnsProviderId, settings: DnsProviderSettings, input: DnsRecordInput): Promise<DnsRecordApplyResult> {
  const hostname = input.hostname.trim().toLowerCase();
  if (hostname.endsWith(".localhost") || hostname === "localhost" || hostname === "127.0.0.1") {
    throw new Error("Local loopback domains do not need provider DNS records.");
  }
  if (net.isIP(input.targetIp) !== 4) {
    throw new Error("DNS automation currently supports A records with IPv4 targets.");
  }

  if (provider === "cloudflare" && settings.provider === "cloudflare") {
    return upsertCloudflareARecord(settings, hostname, input.targetIp);
  }
  if (provider === "namecheap" && settings.provider === "namecheap") {
    return upsertNamecheapARecord(settings, hostname, input.targetIp, input.publicIp);
  }
  if (provider === "spaceship" && settings.provider === "spaceship") {
    return upsertSpaceshipARecord(settings, hostname, input.targetIp);
  }

  throw new Error(`Invalid ${dnsProviderName(provider)} DNS settings.`);
}

function providerError(message: string, status?: number): ProviderRequestError {
  const error = new Error(message) as ProviderRequestError;
  error.status = status;
  return error;
}

function isDomainLookupMiss(error: unknown) {
  const status = (error as ProviderRequestError | undefined)?.status;
  if (status === 404 || status === 422) return true;
  const message = error instanceof Error ? error.message : "";
  return /domain not found|not associated/i.test(message);
}

function domainCandidates(hostname: string) {
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) throw new Error("Use a valid public hostname.");
  if (labels.length === 2) return [hostname];

  const candidates: string[] = [];
  for (let index = 1; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join("."));
  }
  return candidates;
}

function hostForDomain(hostname: string, domain: string) {
  if (hostname === domain) return "@";
  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) throw new Error(`${hostname} is not within ${domain}.`);
  return hostname.slice(0, -suffix.length);
}

function splitRegisteredDomain(domain: string) {
  const [sld, ...tldParts] = domain.split(".");
  if (!sld || tldParts.length === 0) throw new Error(`Could not split ${domain} into SLD and TLD.`);
  return { sld, tld: tldParts.join(".") };
}

async function parseJsonResponse<T>(response: Response, provider: string): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const detail = typeof payload === "object" && payload && "detail" in payload ? String((payload as { detail?: unknown }).detail) : "";
    const message = detail || `${provider} returned HTTP ${response.status}`;
    throw providerError(message, response.status);
  }
  return payload as T;
}

async function cloudflareRequest<T>(settings: CloudflareDnsSettings, path: string, init?: RequestInit) {
  const authHeaders = settings.accountEmail
    ? {
        "X-Auth-Email": settings.accountEmail,
        "X-Auth-Key": settings.apiToken
      }
    : {
        "Authorization": `Bearer ${settings.apiToken}`
      };
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = await parseJsonResponse<CloudflareApiResponse<T>>(response, "Cloudflare");
  if (!payload.success) {
    const message = payload.errors?.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare DNS request failed.";
    throw providerError(message, response.status);
  }
  return payload.result;
}

async function resolveCloudflareZone(settings: CloudflareDnsSettings, hostname: string) {
  if (settings.zoneId.trim()) {
    return { id: settings.zoneId.trim(), name: "" };
  }

  for (const candidate of domainCandidates(hostname)) {
    const params = new URLSearchParams({ name: candidate, per_page: "1" });
    const zones = await cloudflareRequest<CloudflareZone[]>(settings, `/zones?${params.toString()}`);
    const zone = zones[0];
    if (zone?.id) return zone;
  }

  throw new Error(`Cloudflare zone for ${hostname} was not found.`);
}

async function upsertCloudflareARecord(settings: CloudflareDnsSettings, hostname: string, targetIp: string): Promise<DnsRecordApplyResult> {
  const zone = await resolveCloudflareZone(settings, hostname);
  const params = new URLSearchParams({ type: "A", name: hostname, per_page: "1" });
  const existingRecords = await cloudflareRequest<CloudflareRecord[]>(settings, `/zones/${zone.id}/dns_records?${params.toString()}`);
  const body = {
    type: "A",
    name: hostname,
    content: targetIp,
    ttl: 1,
    proxied: false
  };

  const existingRecord = existingRecords[0];
  if (existingRecord) {
    await cloudflareRequest<CloudflareRecord>(settings, `/zones/${zone.id}/dns_records/${existingRecord.id}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  } else {
    await cloudflareRequest<CloudflareRecord>(settings, `/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  const zoneName = zone.name || hostname;
  return {
    provider: "cloudflare",
    providerName: providerNames.cloudflare,
    action: existingRecord ? "updated" : "created",
    hostname,
    recordType: "A",
    host: zone.name ? hostForDomain(hostname, zone.name) : hostname,
    zone: zoneName,
    targetIp
  };
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function parseXmlAttributes(input: string) {
  const attributes: Record<string, string> = {};
  for (const match of input.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    attributes[match[1] ?? ""] = decodeXmlEntities(match[2] ?? "");
  }
  return attributes;
}

function namecheapError(xml: string) {
  const errors = [...xml.matchAll(/<Error\b[^>]*>([\s\S]*?)<\/Error>/gi)]
    .map((match) => decodeXmlEntities(String(match[1] ?? "").replace(/<[^>]+>/g, "").trim()))
    .filter(Boolean);
  if (errors.length > 0) return errors.join("; ");
  if (/Status="ERROR"/i.test(xml)) return "Namecheap DNS request failed.";
  return "";
}

function parseNamecheapHosts(xml: string) {
  const error = namecheapError(xml);
  if (error) throw new Error(error);
  return [...xml.matchAll(/<Host\b([^>]*)\/>/gi)].map((match) => parseXmlAttributes(match[1] ?? ""));
}

function namecheapParams(settings: NamecheapDnsSettings, command: string, params: Record<string, string>, clientIp: string) {
  return new URLSearchParams({
    ApiUser: settings.apiUser,
    ApiKey: settings.apiKey,
    UserName: settings.apiUser,
    Command: command,
    ClientIp: settings.clientIp || clientIp,
    ...params
  });
}

async function namecheapRequest(settings: NamecheapDnsSettings, command: string, params: Record<string, string>, clientIp: string) {
  const searchParams = namecheapParams(settings, command, params, clientIp);
  const url = `https://api.namecheap.com/xml.response?${searchParams.toString()}`;
  const requestInit: RequestInit = url.length > 7000
    ? {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: searchParams.toString()
      }
    : {};
  const response = await fetch(url.length > 7000 ? "https://api.namecheap.com/xml.response" : url, requestInit);
  const xml = await response.text();
  if (!response.ok) throw providerError(namecheapError(xml) || `Namecheap returned HTTP ${response.status}`, response.status);
  const error = namecheapError(xml);
  if (error) throw providerError(error, response.status);
  return xml;
}

async function resolveNamecheapDomain(settings: NamecheapDnsSettings, hostname: string, clientIp: string) {
  let lastError: unknown = null;
  for (const candidate of domainCandidates(hostname)) {
    const { sld, tld } = splitRegisteredDomain(candidate);
    try {
      const xml = await namecheapRequest(settings, "namecheap.domains.dns.getHosts", { SLD: sld, TLD: tld }, clientIp);
      return {
        domain: candidate,
        sld,
        tld,
        hosts: parseNamecheapHosts(xml)
      };
    } catch (error) {
      lastError = error;
      if (!isDomainLookupMiss(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Namecheap domain for ${hostname} was not found.`);
}

function namecheapHostMatches(host: NamecheapHost, hostName: string) {
  return (host.Name ?? "").toLowerCase() === hostName.toLowerCase() && (host.Type ?? "").toUpperCase() === "A";
}

function namecheapSetHostsParams(domain: { sld: string; tld: string }, hosts: NamecheapHost[]) {
  const params: Record<string, string> = {
    SLD: domain.sld,
    TLD: domain.tld
  };

  hosts.forEach((host, index) => {
    const position = String(index + 1);
    params[`HostName${position}`] = host.Name || "@";
    params[`RecordType${position}`] = host.Type || "A";
    params[`Address${position}`] = host.Address || "";
    for (const key of ["TTL", "MXPref", "Flag", "Tag"]) {
      if (host[key]) params[`${key}${position}`] = host[key];
    }
  });

  return params;
}

async function upsertNamecheapARecord(settings: NamecheapDnsSettings, hostname: string, targetIp: string, publicIp: string): Promise<DnsRecordApplyResult> {
  const resolved = await resolveNamecheapDomain(settings, hostname, publicIp);
  const hostName = hostForDomain(hostname, resolved.domain);
  const existingHosts = resolved.hosts.filter((host) => namecheapHostMatches(host, hostName));
  const nextHosts = resolved.hosts.filter((host) => !namecheapHostMatches(host, hostName));
  nextHosts.push({
    Name: hostName,
    Type: "A",
    Address: targetIp,
    TTL: "1800"
  });

  const xml = await namecheapRequest(
    settings,
    "namecheap.domains.dns.setHosts",
    namecheapSetHostsParams({ sld: resolved.sld, tld: resolved.tld }, nextHosts),
    publicIp
  );
  if (!/IsSuccess="true"/i.test(xml)) {
    throw new Error("Namecheap did not confirm the DNS records were saved.");
  }

  return {
    provider: "namecheap",
    providerName: providerNames.namecheap,
    action: existingHosts.length > 0 ? "updated" : "created",
    hostname,
    recordType: "A",
    host: hostName,
    zone: resolved.domain,
    targetIp
  };
}

async function spaceshipRequest<T>(settings: SpaceshipDnsSettings, path: string, init?: RequestInit) {
  const response = await fetch(`https://spaceship.dev/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": settings.apiKey,
      "X-API-Secret": settings.apiSecret,
      ...(init?.headers ?? {})
    }
  });
  if (response.status === 204) return null as T;
  return parseJsonResponse<T>(response, "Spaceship");
}

async function resolveSpaceshipDomain(settings: SpaceshipDnsSettings, hostname: string) {
  let lastError: unknown = null;
  for (const candidate of domainCandidates(hostname)) {
    try {
      const params = new URLSearchParams({ take: "500", skip: "0" });
      const response = await spaceshipRequest<SpaceshipRecordsResponse>(settings, `/dns/records/${candidate}?${params.toString()}`);
      return {
        domain: candidate,
        records: response.items ?? []
      };
    } catch (error) {
      lastError = error;
      if (!isDomainLookupMiss(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Spaceship domain for ${hostname} was not found.`);
}

function spaceshipRecordNameMatches(record: SpaceshipRecord, hostName: string) {
  return record.name.toLowerCase() === hostName.toLowerCase();
}

function spaceshipARecordMatches(record: SpaceshipRecord, hostName: string) {
  return record.type.toUpperCase() === "A" && spaceshipRecordNameMatches(record, hostName);
}

function spaceshipRecordConflictsWithA(record: SpaceshipRecord, hostName: string, hasSingleCorrectARecord: boolean) {
  if (!spaceshipRecordNameMatches(record, hostName)) return false;
  const type = record.type.toUpperCase();
  if (type === "CNAME" || type === "ALIAS") return true;
  if (type === "A") return !hasSingleCorrectARecord;
  return false;
}

function spaceshipDeleteRecordPayload(record: SpaceshipRecord) {
  const { ttl: _ttl, group: _group, ...payload } = record;
  return payload;
}

async function deleteSpaceshipRecords(settings: SpaceshipDnsSettings, domain: string, records: SpaceshipRecord[]) {
  for (let index = 0; index < records.length; index += 500) {
    const batch = records.slice(index, index + 500).map(spaceshipDeleteRecordPayload);
    await spaceshipRequest<null>(settings, `/dns/records/${domain}`, {
      method: "DELETE",
      body: JSON.stringify(batch)
    });
  }
}

async function upsertSpaceshipARecord(settings: SpaceshipDnsSettings, hostname: string, targetIp: string): Promise<DnsRecordApplyResult> {
  const resolved = await resolveSpaceshipDomain(settings, hostname);
  const hostName = hostForDomain(hostname, resolved.domain);
  const sameHostRecords = resolved.records.filter((record) => spaceshipRecordNameMatches(record, hostName));
  const existingARecords = resolved.records.filter((record) => spaceshipARecordMatches(record, hostName));
  const hasSingleCorrectARecord = existingARecords.length === 1 && existingARecords[0]?.address === targetIp;
  const conflictingRecords = resolved.records.filter((record) => spaceshipRecordConflictsWithA(record, hostName, hasSingleCorrectARecord));

  if (conflictingRecords.length > 0) {
    await deleteSpaceshipRecords(settings, resolved.domain, conflictingRecords);
  }

  await spaceshipRequest<null>(settings, `/dns/records/${resolved.domain}`, {
    method: "PUT",
    body: JSON.stringify({
      force: false,
      items: [
        {
          type: "A",
          address: targetIp,
          name: hostName,
          ttl: 1800
        }
      ]
    })
  });

  return {
    provider: "spaceship",
    providerName: providerNames.spaceship,
    action: sameHostRecords.length > 0 ? "updated" : "created",
    hostname,
    recordType: "A",
    host: hostName,
    zone: resolved.domain,
    targetIp
  };
}
