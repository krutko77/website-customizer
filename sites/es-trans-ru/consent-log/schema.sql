-- Журнал согласий на обработку персональных данных — es-trans.ru
-- Выполнить один раз в phpMyAdmin Timeweb (или через консоль MySQL).
--
-- Назначение: доказательство факта согласия по ч. 1 ст. 9 152-ФЗ.
-- Бремя доказывания лежит на операторе, поэтому хранится не только «галочка
-- стояла», но и КАКОЙ ИМЕННО текст человек видел в момент отправки.

CREATE TABLE IF NOT EXISTS `consents` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Когда. UTC, чтобы не зависеть от часового пояса сервера и перевода часов.
  `created_at`      DATETIME     NOT NULL,

  -- Какая форма: form-customs | form-offer | form-driver
  `form_id`         VARCHAR(64)  NOT NULL,

  -- Кого касается согласие. Заполняются те поля, что есть в конкретной форме.
  `subject_name`    VARCHAR(255)     NULL,
  `subject_phone`   VARCHAR(64)      NULL,
  `subject_email`   VARCHAR(255)     NULL,

  -- Технические признаки сессии.
  `ip`              VARCHAR(45)      NULL,   -- 45 символов: помещается IPv6
  `user_agent`      VARCHAR(512)     NULL,
  `page_url`        VARCHAR(512)     NULL,   -- со страницы какой отправлено

  -- Что именно человек принял.
  `consent_given`   TINYINT(1)   NOT NULL DEFAULT 0,
  `consent_version` VARCHAR(32)  NOT NULL,   -- напр. '2026-08-18'
  `consent_text`    TEXT             NULL,   -- полный текст на момент отправки
  `consent_hash`    CHAR(64)         NULL,   -- sha256 текста, для быстрой сверки

  PRIMARY KEY (`id`),
  KEY `idx_created`  (`created_at`),
  KEY `idx_phone`    (`subject_phone`),
  KEY `idx_email`    (`subject_email`),
  KEY `idx_form`     (`form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Индексы по телефону и e-mail нужны не «для скорости», а потому что по
-- ст. 14 и ст. 21 152-ФЗ субъект вправе запросить сведения о своих данных
-- и их удаление — искать придётся именно по контакту.

-- ============================================================
-- Типовые запросы, которые понадобятся
-- ============================================================

-- 1) Все согласия конкретного человека (запрос субъекта / проверка РКН):
-- SELECT * FROM consents WHERE subject_phone = '+7 999 000-00-00'
--    OR subject_email = 'ivan@example.com' ORDER BY created_at DESC;

-- 2) Удаление по требованию субъекта (ст. 21). ВНИМАНИЕ: удалять сам факт
--    согласия обычно НЕ нужно — он обосновывает законность прошлой обработки.
--    Обезличиваем контакты, оставляя запись о факте:
-- UPDATE consents SET subject_name = NULL, subject_phone = NULL,
--        subject_email = NULL, ip = NULL, user_agent = NULL
--  WHERE id = 123;

-- 3) Сколько согласий по какой редакции текста (после правки Политики):
-- SELECT consent_version, COUNT(*) FROM consents GROUP BY consent_version;
