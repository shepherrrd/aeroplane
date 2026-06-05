import { ApiIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { api, type DnsSettingsStatus } from "../../api";
import { SectionTitle } from "../ui/primitives";
import {
  blankCredentials,
  createDnsConnections,
  createDnsCredentials,
  dnsProviders,
  type DnsCredentialValues,
  type DnsProviderId
} from "./dns-management-data";
import { DnsCredentialsForm } from "./dns-credentials-form";
import { DnsProviderCard } from "./dns-provider-card";
import { DnsProviderLogo } from "./dns-provider-logo";

export function DnsManagementPanel() {
  const [selectedProviderId, setSelectedProviderId] = useState<DnsProviderId>("cloudflare");
  const [credentials, setCredentials] = useState(createDnsCredentials);
  const [connections, setConnections] = useState(createDnsConnections);
  const [editingProviderId, setEditingProviderId] = useState<DnsProviderId | null>("cloudflare");
  const [credentialError, setCredentialError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyProviderId, setBusyProviderId] = useState<DnsProviderId | null>(null);

  const selectedProvider = useMemo(
    () => dnsProviders.find((provider) => provider.id === selectedProviderId) ?? dnsProviders[0],
    [selectedProviderId]
  );
  const selectedCredentials = credentials[selectedProvider.id];
  const selectedConnection = connections[selectedProvider.id];
  const editingSelectedProvider = editingProviderId === selectedProvider.id || !selectedConnection.connected;
  const selectedProviderBusy = busyProviderId === selectedProvider.id;

  function syncDnsSettings(dns: DnsSettingsStatus) {
    const nextConnections = createDnsConnections();
    const nextCredentials = createDnsCredentials();

    for (const provider of dnsProviders) {
      const status = dns.providers.find((item) => item.id === provider.id);
      if (!status) continue;

      nextConnections[provider.id] = {
        connected: status.connected,
        keySuffix: status.keySuffix,
        savedAt: status.updatedAt ?? status.connectedAt ?? ""
      };

      const values = blankCredentials(provider);
      for (const field of provider.fields) {
        if (status.values[field.key]) {
          values[field.key] = status.values[field.key];
        } else if (field.type === "password" && status.secretSuffixes[field.key]) {
          values[field.key] = `******${status.secretSuffixes[field.key]}`;
        }
      }
      nextCredentials[provider.id] = values;
    }

    setConnections(nextConnections);
    setCredentials(nextCredentials);
    setEditingProviderId((current) => {
      if (current && !nextConnections[current].connected) return current;
      return nextConnections[selectedProviderId].connected ? null : selectedProviderId;
    });
  }

  useEffect(() => {
    let ignore = false;

    async function loadDnsSettings() {
      setLoading(true);
      try {
        const response = await api.dnsSettings();
        if (!ignore) {
          syncDnsSettings(response.dns);
          setCredentialError("");
        }
      } catch (error) {
        if (!ignore) setCredentialError(error instanceof Error ? error.message : "Could not load DNS providers.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadDnsSettings();
    return () => {
      ignore = true;
    };
  }, []);

  function selectProvider(providerId: DnsProviderId) {
    setSelectedProviderId(providerId);
    setCredentialError("");
    if (!connections[providerId].connected) setEditingProviderId(providerId);
  }

  function updateSelectedCredentials(values: DnsCredentialValues) {
    setCredentials((current) => ({
      ...current,
      [selectedProvider.id]: values
    }));
  }

  async function saveSelectedCredentials() {
    const missingField = selectedProvider.fields.find((field) => field.required && !selectedCredentials[field.key]?.trim());
    if (missingField) {
      setCredentialError(`${missingField.label} is required.`);
      return;
    }

    setBusyProviderId(selectedProvider.id);
    try {
      const response = await api.updateDnsProvider(selectedProvider.id, selectedCredentials);
      syncDnsSettings(response.dns);
      setCredentialError("");
      setEditingProviderId(null);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : `Could not save ${selectedProvider.name} credentials.`);
    } finally {
      setBusyProviderId(null);
    }
  }

  async function disconnectSelectedProvider() {
    setBusyProviderId(selectedProvider.id);
    try {
      const response = await api.disconnectDnsProvider(selectedProvider.id);
      syncDnsSettings(response.dns);
      setCredentialError("");
      setEditingProviderId(selectedProvider.id);
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : `Could not disconnect ${selectedProvider.name}.`);
    } finally {
      setBusyProviderId(null);
    }
  }

  return (
    <section className="space-y-5 border border-zinc-800 bg-zinc-950/30 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionTitle icon={ApiIcon} title="DNS Management API" meta="Provider credentials for automated DNS." />
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <DnsProviderLogo provider={selectedProvider} className="max-h-4 max-w-6" />
          {selectedProvider.name}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {dnsProviders.map((provider) => (
          <DnsProviderCard
            key={provider.id}
            provider={provider}
            selected={provider.id === selectedProvider.id}
            connected={connections[provider.id].connected}
            onSelect={() => selectProvider(provider.id)}
          />
        ))}
      </div>

      {loading ? <div className="border border-zinc-800 bg-zinc-900/55 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Loading DNS providers...</div> : null}
      {credentialError && !editingSelectedProvider ? <div className="border border-rose-500/35 bg-rose-950/25 px-3 py-2 font-mono text-[10px] text-rose-200">{credentialError}</div> : null}

      <div className="max-w-4xl">
        <DnsCredentialsForm
          provider={selectedProvider}
          values={selectedCredentials}
          connection={selectedConnection}
          editing={editingSelectedProvider}
          error={credentialError}
          busy={selectedProviderBusy}
          onChange={updateSelectedCredentials}
          onSave={() => void saveSelectedCredentials()}
          onEdit={() => setEditingProviderId(selectedProvider.id)}
          onCancel={() => setEditingProviderId(null)}
          onDisconnect={() => void disconnectSelectedProvider()}
        />
      </div>
    </section>
  );
}
