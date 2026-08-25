<?php declare(strict_types=1);
/**
 * Обработчик форм обратной связи — es-trans.ru
 * Замена для files/sendmail/sendmail.php
 *
 * Что изменилось по сравнению с прежней версией:
 *   1. Пароль SMTP вынесен из кода в конфиг вне public_html.
 *   2. Согласие на обработку ПДн проверяется НА СЕРВЕРЕ и записывается
 *      в БД (ч. 1 ст. 9 152-ФЗ — доказывать наличие согласия обязан оператор).
 *   3. Возвращена защита от ботов (honeypot вместо жёсткого code=NOSPAM).
 *   4. Значения экранируются перед вставкой в HTML-письмо (была XSS).
 *   5. Исправлены условия вида trim(!empty($x)) — они всегда были истинны.
 *
 * ВАЖНО: сначала выполните schema.sql и заполните конфиг, иначе формы
 * начнут отвечать ошибкой.
 */


use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Пути ОБЯЗАТЕЛЬНО через __DIR__: относительный require ищет файл от текущей
// рабочей директории процесса (у PHP-FPM это обычно корень сайта, а не папка
// скрипта), а не рядом со скриптом. Без __DIR__ — Fatal error и HTTP 500.
require __DIR__ . '/phpmailer/src/Exception.php';
require __DIR__ . '/phpmailer/src/PHPMailer.php';
require __DIR__ . '/phpmailer/src/SMTP.php';

// ------------------------------------------------------------------
// Конфиг. Путь считается от files/sendmail/ вверх до корня аккаунта.
// Если структура на хостинге другая — поправьте ТОЛЬКО эту строку.
//   files/sendmail/  ->  ../../..  ->  корень аккаунта  ->  config/
// ------------------------------------------------------------------
$configPath = __DIR__ . '/../../../config/es-trans-config.php';

if (!is_file($configPath)) {
    // Не раскрываем путь наружу — он ушёл бы в подсказку злоумышленнику.
    error_log('sendmail: конфиг не найден по пути ' . $configPath);
    respond(false, 'Сервис временно недоступен. Позвоните нам по телефону.');
}
$config = require $configPath;

// ------------------------------------------------------------------
// Описание форм. Ключ — id формы, значение — её поля.
// Добавляете новую форму на сайте — добавьте её сюда, и согласие
// начнёт логироваться автоматически.
// ------------------------------------------------------------------
$FORMS = [
    'form-customs' => [
        'title'     => 'Форма по услугам растаможки',
        'agreement' => 'agreement-customs',
        'name'      => 'first-name-customs',
        'phone'     => 'tel-customs',
        'email'     => 'email-customs',
        'fields'    => [
            'company-name-customs' => 'Название компании',
            'first-name-customs'   => 'Имя клиента по растаможке',
            'tel-customs'          => 'Телефон',
            'email-customs'        => 'Email',
            'text-message-customs' => 'Сообщение',
        ],
    ],
    'form-offer' => [
        'title'     => 'Форма по вакансиям менеджера или логиста',
        'agreement' => 'agreement',
        'name'      => 'first-name-offer',
        'phone'     => 'tel-offer',
        'email'     => 'email-offer',
        'fields'    => [
            'first-name-offer'   => 'Имя кандидата',
            'last-name-offer'    => 'Фамилия кандидата',
            'tel-offer'          => 'Телефон или мессенджер',
            'email-offer'        => 'Email',
            'text-message-offer' => 'Сообщение',
        ],
    ],
    'form-driver' => [
        'title'     => 'Форма по вакансии водителя',
        'agreement' => 'agreement',
        'name'      => 'name-driver',
        'phone'     => 'tel-driver',
        'email'     => null,
        'fields'    => [
            'name-driver' => 'Имя и фамилия водителя',
            'tel-driver'  => 'Телефон или мессенджер водителя',
        ],
    ],
];

// ------------------------------------------------------------------
// 0. Только POST
// ------------------------------------------------------------------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'Метод не поддерживается.');
}

// ------------------------------------------------------------------
// 1. Антибот: honeypot.
// В форму добавляется скрытое поле website (см. README, правка вёрстки).
// Человек его не видит и не заполняет; бот заполняет все поля подряд.
// Молча отвечаем «успех», чтобы бот не понял, что его отсекли.
// ------------------------------------------------------------------
if (!empty(trim((string)($_POST['website'] ?? '')))) {
    respond(true, 'Данные отправлены!');
}

// ------------------------------------------------------------------
// 2. Определяем, какая форма пришла — по набору заполненных полей.
// ------------------------------------------------------------------
$formId = null;
foreach ($FORMS as $id => $def) {
    foreach (array_keys($def['fields']) as $field) {
        if (val($field) !== '') { $formId = $id; break 2; }
    }
}
if ($formId === null) {
    respond(false, 'Форма пуста. Заполните поля и попробуйте снова.');
}
$form = $FORMS[$formId];

// ------------------------------------------------------------------
// 3. Согласие на обработку ПДн — проверка НА СЕРВЕРЕ.
//
// Прежде проверка была только в HTML (required). Её обходит любой, кто
// отключит JS или отправит POST напрямую, — и тогда данные обрабатывались
// бы без согласия, что прямо противоречит ч. 1 ст. 9 152-ФЗ.
// ------------------------------------------------------------------
$agreementField = $form['agreement'];
$agreementRaw   = (string)($_POST[$agreementField] ?? '');
$consentGiven   = in_array(strtolower(trim($agreementRaw)), ['on', '1', 'true', 'yes'], true);

if (!$consentGiven) {
    respond(false, 'Необходимо согласие на обработку персональных данных.');
}

// ------------------------------------------------------------------
// 4. Пишем согласие в журнал ДО отправки письма.
//
// Порядок важен: если письмо ушло, а запись не создалась, у нас останутся
// персональные данные без доказательства согласия. Обратный порядок
// безопаснее — лишняя запись без письма проблемой не является.
// ------------------------------------------------------------------
$consentSaved = saveConsent($config, $formId, $form);

// ------------------------------------------------------------------
// 5. Собираем письмо. Все значения экранируются: раньше их вставляли
// в HTML как есть, и отправитель мог подделать вид письма или протащить
// в него разметку.
// ------------------------------------------------------------------
$body  = '<h2>Данные из формы обратной связи</h2>';
$body .= '<p><strong>Форма:</strong> ' . e($form['title']) . '</p>';

foreach ($form['fields'] as $field => $label) {
    $v = val($field);
    if ($v !== '') {
        $body .= '<p><strong>' . e($label) . ':</strong> ' . e($v) . '</p>';
    }
}

// Отметка о согласии прямо в письме — чтобы менеджер видел его в заявке,
// а не только в базе.
$body .= '<hr>';
$body .= '<p><strong>Согласие на обработку ПДн:</strong> получено</p>';
$body .= '<p><strong>Редакция согласия:</strong> ' . e($config['consent']['version']) . '</p>';
$body .= '<p><strong>Дата и время (UTC):</strong> ' . e(gmdate('Y-m-d H:i:s')) . '</p>';
$body .= '<p><strong>IP:</strong> ' . e(clientIp()) . '</p>';
if (!$consentSaved) {
    $body .= '<p style="color:#b00"><strong>ВНИМАНИЕ:</strong> не удалось '
           . 'записать согласие в базу, см. резервный лог на сервере.</p>';
}

// ------------------------------------------------------------------
// 6. Отправка
// ------------------------------------------------------------------
try {
    $mail = new PHPMailer(true);
    $mail->CharSet = 'UTF-8';
    $mail->setLanguage('ru', __DIR__ . '/phpmailer/language/');
    $mail->IsHTML(true);

    $mail->isSMTP();
    $mail->Host       = $config['smtp']['host'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $config['smtp']['user'];
    $mail->Password   = $config['smtp']['password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port       = (int)$config['smtp']['port'];

    $mail->setFrom($config['smtp']['from'], $config['smtp']['from_name']);
    $mail->addAddress($config['smtp']['to']);

    // Отвечать менеджер будет на адрес клиента, если тот его оставил.
    $replyTo = $form['email'] ? val($form['email']) : '';
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $mail->addReplyTo($replyTo);
    }

    $mail->Subject = 'Заявка с сайта ЕС Транс — ' . $form['title'];
    $mail->Body    = $body;
    $mail->AltBody = strip_tags(str_replace(['</p>', '<hr>'], ["\n", "\n---\n"], $body));

    $mail->send();
    respond(true, 'Данные отправлены!');

} catch (Exception $e) {
    // Текст ошибки — только в лог сервера. Наружу его отдавать нельзя:
    // он раскрывает почтовые реквизиты.
    error_log('sendmail: ошибка отправки — ' . $mail->ErrorInfo);
    respond(false, 'Не удалось отправить сообщение. Позвоните нам по телефону.');
}

// ==================================================================
// Вспомогательные функции
// ==================================================================

/** Значение поля POST, обрезанное по краям. */
function val(string $key): string
{
    return trim((string)($_POST[$key] ?? ''));
}

/** Экранирование для вставки в HTML-письмо. */
function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Обрезка строки до N байт без «разрубания» UTF-8 посередине.
 * Через mb_substr было бы короче, но расширение mbstring есть не на каждом
 * хостинге, а падение здесь стоило бы потери записи о согласии.
 */
function cut(string $s, int $limit): string
{
    if (strlen($s) <= $limit) return $s;
    $s = substr($s, 0, $limit);
    // Отбрасываем возможный «хвост» незавершённого многобайтового символа.
    while ($s !== '' && (ord($s[strlen($s) - 1]) & 0xC0) === 0x80) {
        $s = substr($s, 0, -1);
    }
    if ($s !== '' && (ord($s[strlen($s) - 1]) & 0xC0) === 0xC0) {
        $s = substr($s, 0, -1);
    }
    return $s;
}

/**
 * IP клиента. За реверс-прокси Timeweb реальный адрес приходит
 * в X-Forwarded-For; берём первый адрес из цепочки.
 */
function clientIp(): string
{
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($xff !== '') {
        $first = trim(explode(',', $xff)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '');
}

/**
 * Запись факта согласия.
 *
 * Пишем в БД; если она недоступна — в резервный файл, чтобы согласие
 * не потерялось из-за сбоя. Возвращает true, если запись сохранена
 * хоть куда-то.
 */
function saveConsent(array $config, string $formId, array $form): bool
{
    $text = (string)$config['consent']['text'];

    $row = [
        'created_at'      => gmdate('Y-m-d H:i:s'),           // UTC
        'form_id'         => $formId,
        'subject_name'    => $form['name']  ? val($form['name'])  : null,
        'subject_phone'   => $form['phone'] ? val($form['phone']) : null,
        'subject_email'   => $form['email'] ? val($form['email']) : null,
        'ip'              => clientIp(),
        'user_agent'      => cut((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 512),
        'page_url'        => cut((string)($_SERVER['HTTP_REFERER'] ?? ''), 512),
        'consent_given'   => 1,
        'consent_version' => (string)$config['consent']['version'],
        'consent_text'    => $text,
        'consent_hash'    => hash('sha256', $text),
    ];

    // --- основной путь: база данных ---
    try {
        $db  = $config['db'];
        $dsn = "mysql:host={$db['host']};dbname={$db['name']};charset={$db['charset']}";
        $pdo = new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        $cols = implode(', ', array_map(fn($c) => "`$c`", array_keys($row)));
        $phs  = implode(', ', array_fill(0, count($row), '?'));
        $pdo->prepare("INSERT INTO `consents` ($cols) VALUES ($phs)")
            ->execute(array_values($row));

        return true;

    } catch (Throwable $ex) {
        error_log('sendmail: не удалось записать согласие в БД — ' . $ex->getMessage());
    }

    // --- запасной путь: файл ---
    try {
        $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
        $ok = @file_put_contents(
            $config['consent']['fallback_log'],
            $line,
            FILE_APPEND | LOCK_EX
        );
        return $ok !== false;

    } catch (Throwable $ex) {
        error_log('sendmail: не удалось записать согласие в файл — ' . $ex->getMessage());
        return false;
    }
}

/** Ответ в формате, который ожидает фронтенд сайта, и выход. */
function respond(bool $ok, string $message): void
{
    header('Content-type: application/json; charset=utf-8');
    // Ключ message сохранён — скрипт формы на сайте читает именно его.
    echo json_encode(['message' => $message, 'ok' => $ok], JSON_UNESCAPED_UNICODE);
    exit;
}
