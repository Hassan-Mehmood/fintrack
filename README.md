# Fintrack

## Docker development with hot reloading

Configure the root `.env` using `.env.example`, then run from the repository root:

```sh
docker compose up --build --watch
```

Keep this command running while editing. Open http://localhost:3000 for the
web app; the API runs at http://localhost:3001.

The automatically loaded `docker-compose.override.yml` selects development
images. Docker Compose Watch syncs source changes into the containers:
Next.js Fast Refresh updates the web app, and NestJS recompiles and restarts
the API. Dependency manifests, lockfiles, and Dockerfiles trigger an automatic
rebuild of the affected service. API compiler configuration and Prisma changes
also rebuild the API and regenerate its Prisma client. Database migrations
still need to be applied explicitly.

Host dependencies, build outputs, and environment files are excluded using
each app's `.dockerignore`. Dependencies and generated files stay inside the
containers. After changing the root `.env` or Compose configuration, stop the
command with Ctrl+C and run it again to recreate containers with those changes.

Use Docker Compose 2.32 or newer. See the
[Compose Watch documentation](https://docs.docker.com/compose/how-tos/file-watch/).

## Docker production build

Explicitly select the base Compose file to skip the development override:

```sh
docker compose -f docker-compose.yml up --build -d
```
