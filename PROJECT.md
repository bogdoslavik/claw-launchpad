KIS + SOTA архитектура OpenClaw Launchpad для DigitalOcean
Executive summary
OpenClaw Launchpad — это «control plane» (тонкий оркестратор), который делает одно действие от имени пользователя: после OAuth-логина в DigitalOcean создаёт Droplet в аккаунте пользователя и передаёт ему cloud-init/user-data, который устанавливает Docker и автоматически запускает OpenClaw в контейнере. Платформа Launchpad не становится владельцем инфраструктуры, не принимает на себя биллинг и (в целевом режиме) не хранит пользовательские секреты дольше, чем нужно для формирования user-data.

Ключевой production-grade, но KIS-подход на 2026 год:

Официальный TypeScript SDK DigitalOcean (DoTs) для всех API-вызовов (минимум “клея”, максимум поддержки).
Authorization Code OAuth flow (серверный) с проверкой state, хранением токена в зашифрованном виде (или короткоживущим) и возможностью отзыва токена после деплоя.
Droplet создаётся асинхронно (202 Accepted), статус отслеживается через action/status + health-check/коллбек от инстанса.
Одна PostgreSQL как системная БД Launchpad + очередь фоновых задач поверх PostgreSQL (pg-boss или Graphile Worker) — без Redis/Valkey на MVP.
Развёртывание самого Launchpad удобно делать на App Platform (SaaS-ready, минимум ops) с зашифрованными env vars, Managed PostgreSQL и базовой наблюдаемостью.
Recommended stack
Ниже — минимальный, но расширяемый стек с конкретными «целевыми» версиями/линиями на апрель 2026 (все версии — ориентиры; в проде фиксируйте major/minor и обновляйте patch автоматически через CI).

Runtime и язык

Node.js v24 (Active LTS) — рекомендованная ветка для production (Active/Maintenance LTS).
TypeScript v6.0.x (стабильный релиз; приготовьтесь к будущим изменениям 7.0, но MVP строить на 6.0 безопаснее).
Backend

HTTP слой: Fastify v5.x (хорошая TypeScript-интеграция и низкие накладные расходы).
Валидация/DTO: Zod (runtime-валидация + вывод типов).
DigitalOcean API: @digitalocean/dots (DoTs) — официальный SDK и «primary, recommended».
OAuth-клиент (опционально, чтобы не писать низкоуровневую логику вручную): oauth4webapi (актуальные security best practices).
Frontend

Next.js 16.2.x + React 19.x (современный fullstack UI, SSR/SPA по необходимости).
Database

PostgreSQL (Managed). На DigitalOcean Managed Databases: ежедневные бэкапы/PITR, HA-опции и SSL в транзите; шифрование на уровне сервиса заявлено в документации.
ORM: Prisma ORM 7.x (типобезопасный клиент и миграции).
Очередь/джобы

pg-boss (очередь поверх PostgreSQL; меньше инфраструктуры, чем Redis-решения).

Альтернатива: Graphile Worker (тоже Postgres-first).
Secrets handling

Для секретов платформы (client_secret OAuth, master key для шифрования токенов, DSN и т.п.): App Platform env vars с режимом Encrypt (значения скрываются из логов и UI).
Для user secrets (Telegram token / LLM API key): в MVP не хранить (см. модель ниже), либо хранить кратковременно и зашифрованно (строго по необходимости).
Observability

Логи: Pino (структурный JSON).
Tracing/metrics: OpenTelemetry JS (vendor-neutral).
Ошибки и performance: Sentry (tracing/perf monitoring в Node).
Architecture diagram in text
Архитектура строится как «тонкий SaaS-оркестратор» + «пользовательский runtime». Платформа хранит только метаданные деплоев и (опционально) краткоживущие/зашифрованные DO-токены; всё выполнение OpenClaw происходит в Droplet пользователя.

text
Копировать
┌──────────────────────────────────────┐
│            Launchpad (SaaS)          │
│  (App Platform / container runtime)  │
└──────────────────────────────────────┘
│
│ HTTPS
▼
┌───────────────┐        ┌──────────────────────────┐        ┌──────────────────────┐
│   Browser UI   │◀──────▶│  Web/API service         │◀──────▶│ PostgreSQL (managed)  │
│ (Next.js 16.2) │        │  (Fastify or Next API)   │        │ users, deployments,   │
└───────────────┘        │  OAuth + Deploy API       │        │ events, idempotency   │
└───────────┬──────────────┘        └───────────┬──────────┘
│                                   │
│ enqueue jobs (pg-boss)            │
▼                                   │
┌──────────────────────────┐                    │
│ Worker service           │◀───────────────────┘
│ (polling, retries,       │
│  health checks, cleanup) │
└───────────┬──────────────┘
│
│ DigitalOcean API (DoTs SDK)
▼
┌──────────────────────────────────────┐
│        User's DigitalOcean account    │
│                                      │
│  Droplet (Ubuntu 24.04) + cloud-init  │
│   ├─ installs Docker                  │
│   ├─ pulls OpenClaw image             │
│   ├─ runs OpenClaw (systemd/compose)  │
│   └─ POST callback to Launchpad       │
└──────────────────────────────────────┘
Пояснение: cloud-init/user-data выполняется на первом boot, как root, и не может быть изменён после создания Droplet; отладка — через /var/log/cloud-init-output.log.

Deploy flow step-by-step
Ниже — целевой «one-click» сценарий с минимизацией ответственности платформы и production-grade деталями интеграции с DigitalOcean (OAuth, Droplet API, cloud-init, статус).

Login with DigitalOcean

Пользователь нажимает “Login with DigitalOcean”. Backend формирует redirect на https://cloud.digitalocean.com/v1/oauth/authorize с response_type=code, client_id, redirect_uri, опционально scope, и случайным state (CSRF защита).
После согласия DigitalOcean редиректит на redirect_uri с code и state. Backend сравнивает state и завершает OAuth.
Backend вызывает https://cloud.digitalocean.com/v1/oauth/token с grant_type=authorization_code, code, client_id, client_secret, redirect_uri. В ответ получает access_token, expires_in (30 дней), refresh_token и info (uuid/team_uuid и т.п.).
Минимальные scopes (важно для снижения ответственности) 4) Для MVP-деплоя достаточно стремиться к минимальному набору scopes: droplet:create и droplet:read (и ничего про billing/доступ к другим продуктам). Это соответствует модели scopes в документации (CRUD-подобные разрешения).

Если в будущем понадобятся: удаление — droplet:delete, firewall — firewall:create/update, домены — domain:update и т.д.
Ввод Telegram token / LLM API key 5) UI показывает форму: Telegram token и LLM API key. Эти значения:

не логируются,
по умолчанию не сохраняются в БД Launchpad,
используются только, чтобы сформировать user-data (cloud-init) для Droplet пользователя.
Deploy 6) Пользователь нажимает Deploy. Backend создаёт запись deployment со статусом requested и генерирует deployment_id + одноразовый bootstrap_token (в БД хранится только хэш bootstrap_token). (Это дизайн-рекомендация; цель — идемпотентность и безопасный коллбек.)

7) Backend вызывает DigitalOcean API создания Droplet (POST /v2/droplets) через официальный DoTs SDK. В body передаёт:

name: openclaw-<deployment_id>
region: выбранный или дефолтный
size: выбранный slug
image: ubuntu-24-04-x64 (существующий slug из таблицы образов)
user_data: cloud-init script (см. ниже)
Важная production особенность: ответ 202 Accepted означает, что запрос принят, но операция ещё выполняется; статус нужно проверять через actions.

KIS-важный нюанс: user_data должен помещаться в лимит и быть простым текстом (в доках встречается ограничение 64 KiB). Это влияет на подход: не кладите в user-data большие конфиги/бинарники.
cloud-init / user-data: установка Docker и автозапуск OpenClaw 9) user_data выполняет:

apt-get update, установка Docker/Compose (через пакетный менеджер или официальный скрипт — выбор реализации),
docker compose up -d с OpenClaw образом,
запись systemd unit, чтобы сервис поднимался после reboot,
curl -X POST на Launchpad callback endpoint с deployment_id + bootstrap_token + прогрессом.
Технически это работает, потому что cloud-init применяет user-data на первом boot и запускает команды от root.
Пример «скелета» cloud-init (сократите/адаптируйте под OpenClaw образ и порты):

yaml
Копировать
#cloud-config
package_update: true

write_files:
- path: /etc/openclaw/env
  permissions: "0400"
  owner: root:root
  content: |
  TELEGRAM_TOKEN=...
  LLM_API_KEY=...
  DEPLOYMENT_ID=...
  LAUNCHPAD_BOOTSTRAP_TOKEN=...

runcmd:
- [ bash, -lc, "mkdir -p /opt/openclaw" ]
- [ bash, -lc, "cd /opt/openclaw && curl -fsSL https://get.docker.com | sh" ]
- [ bash, -lc, "systemctl enable --now docker" ]
- [ bash, -lc, "cd /opt/openclaw && docker compose up -d" ]
- [ bash, -lc, "curl -fsS -X POST https://launchpad.example.com/api/v1/deployments/callback -H 'Content-Type: application/json' -d '{\"deploymentId\":\"...\",\"token\":\"...\",\"stage\":\"openclaw_started\"}' || true" ]
  cloud-init доступен на актуальных Ubuntu-образах; user-data после создания Droplet изменить нельзя; для дебага используйте /var/log/cloud-init-output.log.

Получение статуса деплоя 10) Для статуса «Droplet создаётся» используйте action objects: status меняется с in-progress на completed и т.д.; это canonical-способ отслеживать асинхронные операции в DigitalOcean API.

11) Для статуса «OpenClaw запущен» используйте комбинацию:

коллбек из cloud-init (быстро и KIS),
и/или health-check (например, HTTP GET /healthz на публичном IP). (Это дизайн-рекомендация: health-check снижает риск ложного “success”.)
Выдача URL 12) Launchpad сохраняет IP/hostname Droplet и показывает пользователю URL вида http://<public_ipv4>. IP берётся из данных Droplet (в DO API он в networks.v4).

Минимизация ответственности после завершения 13) В “minimal responsibility mode” Launchpad:

отзывает OAuth access token через /revoke (или удаляет его у себя),
не хранит Telegram/LLM ключи,
хранит только метаданные деплоя (deployment_id, droplet_id, region/size, timestamps, статус).
Data model
Цель модели данных — быть минимальной, но поддерживать идемпотентность, аудит “что случилось”, retry и отображение статуса. Ниже — рекомендуемая реляционная схема (PostgreSQL), которую удобно вести через Prisma миграции.

users

id (UUID, PK)
createdAt, updatedAt
doUserUuid (из info.uuid OAuth ответа)
doTeamUuid (из info.team_uuid)
email (опционально: из info.email, если нужно для поддержки)
oauth_connections (если вы решите хранить токены; в minimal-mode можно не заводить)

id
userId (FK)
provider = digitalocean
accessTokenEncrypted
refreshTokenEncrypted
accessTokenExpiresAt (OAuth expires_in)
revokedAt (nullable)
lastUsedAt
mode enum: minimal | managed (в managed-mode вы храните токены дольше для delete/redeploy и richer статуса)
deployments

id (UUID, PK)
userId (FK)
status enum: requested → droplet_creating → droplet_active → bootstrapping → running | failed | canceled
idempotencyKey (string, unique per user)
dropletId (int, nullable)
dropletName (string, unique per user/team; удобно для восстановления)
region, sizeSlug, imageSlug (например ubuntu-24-04-x64)
publicIpv4 (nullable)
createdAt, startedAt, finishedAt
lastErrorCode, lastErrorMessage (nullable)
deployment_callbacks

deploymentId (FK, unique)
bootstrapTokenHash (для проверки коллбеков; хранить хэш, не “сырой” токен)
expiresAt (TTL, например 24 часа)
deployment_events (аудит/таймлайн)

id
deploymentId
ts
type enum: oauth_connected, droplet_create_requested, droplet_action_completed, cloud_init_started, docker_installed, openclaw_started, healthcheck_ok, failed
payload (JSONB, без секретов)
jobs (pg-boss schema)

Таблицы создаёт сама библиотека в Postgres; вы храните только deploymentId и “инструкции”, без чувствительных данных.
API design
API максимально небольшой: auth, deployments, status, callbacks. Это даёт простой frontend и чёткую границу ответственности: Launchpad управляет только оркестрацией и метаданными.

Auth

GET /api/v1/auth/digitalocean/start
Возвращает редирект на /v1/oauth/authorize, устанавливает cookie/entry для state.
GET /api/v1/auth/digitalocean/callback?code=...&state=...
Проверяет state, меняет code на access_token через /v1/oauth/token, создаёт user/session.
POST /api/v1/auth/digitalocean/disconnect
(опционально) вызывает /v1/oauth/revoke и чистит локальные данные.
Deployments

POST /api/v1/deployments
Body: { telegramToken, llmApiKey, region?, sizeSlug? }
создаёт deployment,
вызывает POST /v2/droplets (DoTs),
сохраняет dropletId/actionId (если доступно) и enqueue job “track”.
GET /api/v1/deployments/:id
Возвращает статусы, публичный IP/URL, таймлайн.
GET /api/v1/deployments?cursor=...
Пагинация по деплоям пользователя (SaaS-ready).
POST /api/v1/deployments/:id/cancel
В minimal-mode это просто “stop tracking” (не удаляя Droplet); в managed-mode — “delete droplet” через API. Требует droplet:delete, если реально удаляете.
Callbacks / status ingestion

POST /api/v1/deployments/callback
Body: { deploymentId, token, stage, details? }
Проверка token по bootstrapTokenHash, запись события, перевод статуса. (Важно: idempotent — повторный stage не ломает состояние.)
Admin/health

GET /healthz, GET /readyz
Для App Platform / контейнерного оркестратора. (Практика production readiness; как минимум, проверка соединения с БД.)
Security and compliance notes
Этот раздел — про то, как сделать «максимально простым» и одновременно минимизирующим ответственность платформы, включая безопасную работу с OAuth и секретами.

OAuth security

Используйте authorization code flow и обязательно проверяйте state (в доках прямо указано как защита от forgery).
Токены имеют срок жизни (в доках указано 30 дней) и поддерживаются refresh/revoke endpoints; refresh token одноразовый — учитывайте это в реализации (избегайте параллельных refresh).
Сокращайте scopes до строго нужных: для MVP-деплоя Droplet достаточно droplet:create/droplet:read. Чем меньше scopes, тем ниже ущерб при компрометации.
User secrets (Telegram token / LLM API key)

KIS-подход “по умолчанию”: не хранить секреты в Launchpad вообще; использовать их только для генерации user_data. Это соответствует принципу минимизации данных и снижает регуляторную/инцидентную поверхность.
Компромисс: secret всё равно окажется на стороне пользователя (в Droplet) — это и есть цель “ownership у пользователя”. Но важно осознавать, что user-data можно прочитать изнутри инстанса через metadata service, следовательно секреты “живут” на инфраструктуре пользователя, а не платформы.
Ограничение user-data

user-data ограничен по размеру (встречается лимит 64 KiB) — поэтому лучше:
делать короткий cloud-init,
тянуть остальные артефакты (compose/yaml) из публичного репозитория/релиз-страницы,
либо собирать “bootstrap bundle” в минимальном виде.
Idempotency, retry, recovery

В DigitalOcean создание Droplet асинхронно (202 Accepted); поэтому в Launchpad нужно хранить state machine деплоя и уметь повторять/досматривать процессы через background jobs.
Учитывайте rate limits API (в документации по Droplets упоминаются лимиты в заголовках и текущие значения). Это влияет на polling частоту и “fan-out” задач.
Secrets платформы

Храните client_secret OAuth, ключи шифрования и DSN как Encrypted env vars App Platform (значения скрываются из логов).
Шифрование данных

Если вы храните токены DigitalOcean в managed-mode: шифруйте их на уровне приложения (envelope encryption/AES-GCM) и храните master key в Encrypted env var. (Это дизайн-рекомендация; базой служит факт, что App Platform поддерживает зашифрованные переменные.)
Наблюдаемость и инциденты

OpenTelemetry — vendor-neutral фреймворк для traces/metrics/logs, но в JS лог-сигнал всё ещё развивается (в доках отмечается статус). Поэтому практично: логи через Pino + traces/metrics через OTel + ошибки через Sentry.
MVP plan, risks and trade-offs, roadmap, final recommendation
MVP plan (минимальный, но production-grade)

UI: 3 шага — login → ввод 2 секретов → deploy → прогресс/URL. (Цель UX из вашего ТЗ.)
Backend: auth + create deployment + статус + callback.
Worker:
polling DO action status (интервал с backoff),
извлечение public IP после completed,
health-check (опционально),
cleanup: отзыв OAuth токена после успеха в minimal-mode.
Инфра Launchpad: App Platform + Managed PostgreSQL + Encrypted env vars.
Инфра пользователя: один Droplet на ubuntu-24-04-x64 + cloud-init.
Риски и trade-offs

Секреты в user-data: это очень просто и соответствует “ownership у пользователя”, но секреты попадают в bootstrap-артефакт на стороне Droplet (и потенциально доступны тем, кто имеет доступ к инстансу/команде пользователя). Альтернатива (сложнее): “first-run wizard” внутри OpenClaw, чтобы Launchpad вообще не принимал секреты.
OAuth токены:
minimal-mode (рекомендуется) снижает ответственность, но уменьшает функциональность “управления” после деплоя;
managed-mode повышает UX (delete/redeploy/полный статус), но требует сильнее проработанного хранения токенов и аудита.
Polling vs callback: polling действий DigitalOcean показывает инфраструктурный статус, но не гарантирует “OpenClaw готов”. callback/health-check закрывают этот разрыв, но требуют внешнего исходящего запроса с Droplet и аккуратной идемпотентности.
Лимит user-data (64 KiB) ограничивает “всё в одном скрипте”; лучше тянуть compose/скрипты по URL/релизам.
Roadmap v2

“Managed mode” по выбору пользователя: хранение refresh token (шифрованно), кнопки “Delete droplet”, “Redeploy”, “Rotate secrets”.
Автосоздание Cloud Firewall (минимальные порты) и/или резервированный IP (улучшение стабильности URL). (Потребует дополнительных scopes из списка.)
Поддержка домена + автоматический TLS (например, через reverse proxy внутри Droplet; это уже часть user-side infra).
Roadmap v3

Marketplace/1-Click улучшения: возможность использовать Docker 1-Click image (ускорить bootstrap) или кастомный образ/снапшот с предустановленным Docker/OpenClaw. Это снижает cloud-init время, но добавляет “supply chain” и поддержку образов.
Более богатая наблюдаемость: экспорт OTel в выбранный бэкенд + алерты на worker SLA (зависит от выбранного провайдера наблюдаемости и бюджета).
Final recommendation with exact stack choices

Frontend: Next.js 16.2.x + React 19.x.
Backend: Fastify v5.x + Zod; TypeScript 6.0.x.
Runtime: Node.js v24 Active LTS.
DigitalOcean integration: официальный SDK @digitalocean/dots (DoTs) + OAuth code flow по документации DO (authorize/token/refresh/revoke).
DB: Managed PostgreSQL + Prisma ORM 7.x.
Jobs/queue: pg-boss (Postgres-backed).
Secrets: App Platform Encrypted env vars для секретов платформы; пользовательские секреты не хранить (или хранить строго опционально и кратковременно, шифруя).
Observability: Pino (logs) + OpenTelemetry (traces/metrics) + Sentry (errors/perf).
User-side deployment target: Droplet image ubuntu-24-04-x64 + cloud-init user-data (Docker install + автозапуск OpenClaw). 