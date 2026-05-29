# get-aeroplane

Tiny Node app for:

```bash
curl -fsSL https://get.aeroplane.run | sh
```

Deploy this directory anywhere that can serve `get.aeroplane.run`.

## Routes

- `GET /` serves `install.sh`
- `GET /install.sh` serves `install.sh`
- `GET /healthz` returns `ok`

## Run

```bash
npm start
```

The app listens on `PORT`, defaulting to `3000`.

## Docker

```bash
docker build -t get-aeroplane .
docker run -p 3000:3000 get-aeroplane
```

The installer pulls `ghcr.io/akinloluwami/aeroplane:latest`, so publish that image before pointing users at the endpoint.
