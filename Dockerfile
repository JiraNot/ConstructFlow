FROM node:22-bookworm-slim AS build

WORKDIR /workspace

# Package installs use local file: dependencies, so build from the repository root.
COPY . .
RUN npm run build:standalone -- --install
RUN node scripts/compress-static-assets.mjs apps/plan-editor/dist \
    && find apps/plan-editor/dist -type f -name '*.wasm' -delete

FROM nginx:alpine AS runtime

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/plan-editor/dist /usr/share/nginx/html

# The official image substitutes only our upstream variable and retains Nginx variables.
ENV NGINX_ENVSUBST_FILTER=AI_GATEWAY_UPSTREAM
ENV AI_GATEWAY_UPSTREAM=ai-gateway:8000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
