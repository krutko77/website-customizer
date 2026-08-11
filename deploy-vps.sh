#!/usr/bin/env bash
# Деплой на VPS-сервер ЕС Транс (Brainy Waxwing, 201.51.4.183)
#
# Настройки перед первым запуском:
#   1. Задай APP_NAME — уникальное имя процесса PM2 (например es-trans-repairs)
#   2. Задай APP_PORT — свободный порт (3003, 3004, ... — смотри занятые: ss -tlnp)
#   3. Задай APP_DOMAIN — поддомен вида xxx.es-trans.ru
#   4. Заполни .env с нужными ключами
#   5. Первый деплой: этот скрипт установит приложение + SSL
#
# ВНИМАНИЕ: скрипт запускает через PM2 файл src/server.js. Серверной части
# в проекте сейчас нет — перед деплоем укажи реальную точку входа
# (см. строку с `pm2 start` ниже).
#
set -euo pipefail

APP_NAME="es-trans-НАЗВАНИЕ"   # ЗАМЕНИ: уникальное имя процесса PM2
APP_PORT=3000                    # ЗАМЕНИ: свободный порт на сервере
APP_DOMAIN="xxx.es-trans.ru"    # ЗАМЕНИ: поддомен (DNS-запись должна уже существовать)
SERVER="root@201.51.4.183"
APP_PATH="/opt/${APP_NAME}"

echo "=== Упаковка проекта ==="
tar czf /tmp/vibe-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=.claude \
  --exclude=.env \
  --exclude=.publish \
  --exclude=.chat-uploads \
  --exclude=data \
  .

echo "=== Загрузка на сервер ==="
scp /tmp/vibe-deploy.tar.gz ${SERVER}:/tmp/

echo "=== Установка на сервере ==="
ssh ${SERVER} bash << REMOTE
  set -e

  # Распаковка
  mkdir -p ${APP_PATH}
  tar xzf /tmp/vibe-deploy.tar.gz -C ${APP_PATH}
  rm /tmp/vibe-deploy.tar.gz

  # Зависимости
  cd ${APP_PATH}
  npm install --production

  # Обновление .env (PORT должен совпадать с APP_PORT)
  if [ -f ${APP_PATH}/.env ]; then
    sed -i "s/^PORT=.*/PORT=${APP_PORT}/" ${APP_PATH}/.env
  fi

  # PM2: перезапустить если уже есть, иначе запустить
  if pm2 describe ${APP_NAME} > /dev/null 2>&1; then
    pm2 restart ${APP_NAME} --update-env
  else
    pm2 start src/server.js --name ${APP_NAME}
    pm2 save
  fi

  echo "Приложение запущено на порту ${APP_PORT}"
REMOTE

echo "=== Проверка HTTPS ==="
# Если домен новый — создаём nginx-конфиг и выпускаем сертификат
if ! ssh ${SERVER} "test -f /etc/nginx/sites-enabled/${APP_DOMAIN}"; then
  echo "Настройка nginx + SSL для ${APP_DOMAIN}..."
  ssh ${SERVER} bash << NGINX
    cat > /etc/nginx/sites-available/${APP_DOMAIN} << 'EOF'
server {
    server_name ${APP_DOMAIN};
    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    listen 80;
}
EOF
    ln -sf /etc/nginx/sites-available/${APP_DOMAIN} /etc/nginx/sites-enabled/${APP_DOMAIN}
    nginx -t && nginx -s reload
    certbot --nginx -d ${APP_DOMAIN} --non-interactive --agree-tos --email admin@es-trans.ru
    echo "SSL готов: https://${APP_DOMAIN}"
NGINX
fi

rm -f /tmp/vibe-deploy.tar.gz

echo ""
echo "✓ Деплой завершён: https://${APP_DOMAIN}"
