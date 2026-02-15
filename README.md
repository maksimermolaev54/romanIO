# Roman.io Reborn - Co-op Online

Онлайн-кооп игра на Canvas + WebSocket.

## Что в репозитории

- `index.html` - клиент игры (готов для GitHub Pages).
- `coop_server.py` - WebSocket сервер комнат для коопа.
- `requirements.txt` - Python зависимости для сервера.

## Локальный запуск (localhost)

1. Установи зависимости:
   - `python -m pip install -r requirements.txt`
2. Запусти сервер:
   - `python coop_server.py`
3. Открой `index.html` в браузере.
4. В режиме `Кооп онлайн` используй:
   - `WS URL`: `ws://localhost:8765`
   - одинаковую комнату для всех игроков

## Публикация на GitHub

1. Инициализация и первый пуш:
   - `git init`
   - `git add .`
   - `git commit -m "Initial co-op version"`
   - `git branch -M main`
   - `git remote add origin https://github.com/<your-username>/<repo>.git`
   - `git push -u origin main`

## Хостинг клиента (GitHub Pages)

1. В GitHub открой репозиторий:
   - `Settings -> Pages`
2. Выбери:
   - `Deploy from a branch`
   - branch `main`, folder `/ (root)`
3. Получишь URL вида:
   - `https://<your-username>.github.io/<repo>/`

## Хостинг WebSocket сервера (Render/Railway/Fly/VPS)

### Render (пример)

1. Создай новый `Web Service` из этого репозитория.
2. Build Command:
   - `pip install -r requirements.txt`
3. Start Command:
   - `python coop_server.py`
4. Сервер использует `PORT` из окружения автоматически.

После деплоя будет адрес типа:
- `wss://<your-service>.onrender.com`

## Что вводить в игре для реального онлайна

В режиме `Кооп онлайн`:
- `WS URL`: `wss://<your-service>.onrender.com`
- `Комната`: одинаковая у всех
- `Ник`: любой

Важно:
- Если игра открыта по `https`, используй только `wss`.
- `localhost` работает только на том же устройстве.

