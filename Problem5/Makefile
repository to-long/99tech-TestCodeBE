.PHONY: i install up down migrate build run dev seed studio

i: install
install:
	bun install

up:
	docker compose up -d

down:
	docker compose down

migrate:
	bun db/migrate.ts

build:
	bun run build

run:
	bun src/main.ts

dev:
	bun --watch src/main.ts

seed:
	bun db/seed/index.ts

studio:
	bunx drizzle-kit studio
