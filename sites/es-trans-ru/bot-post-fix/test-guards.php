<?php declare(strict_types=1);
/**
 * Тест защит от прямого POST — requestFromSite() и rateLimitOk().
 *
 * Запуск:  php sites/es-trans-ru/bot-post-fix/test-guards.php
 *
 * Функции выдёргиваются из sendmail.php без его выполнения: сам обработчик
 * при подключении сразу требует PHPMailer, конфиг и шлёт ответ. Поэтому
 * берём исходник, вырезаем тела нужных функций и eval-им их отдельно.
 */

$src = file_get_contents(__DIR__ . '/sendmail.php');
if ($src === false) {
    fwrite(STDERR, "Не читается sendmail.php\n");
    exit(1);
}

// Вырезаем нужные функции по их сигнатурам до закрывающей скобки в начале строки.
$wanted = ['requestFromSite', 'rateLimitOk', 'cleanupRateLimitDir', 'clientIp'];
$code   = '';
foreach ($wanted as $fn) {
    if (!preg_match('/\nfunction ' . $fn . '\([^\n]*\n\{.*?\n\}/s', $src, $m)) {
        fwrite(STDERR, "Не найдена функция $fn — тест не соответствует коду\n");
        exit(1);
    }
    $code .= $m[0] . "\n";
}
eval($code);

$pass = 0;
$fail = 0;

function check(string $name, bool $got, bool $want): void
{
    global $pass, $fail;
    if ($got === $want) {
        $pass++;
        echo "  ✅ $name\n";
    } else {
        $fail++;
        echo "  ❌ $name — ожидалось " . var_export($want, true)
            . ", получено " . var_export($got, true) . "\n";
    }
}

function resetServer(): void
{
    unset($_SERVER['HTTP_ORIGIN'], $_SERVER['HTTP_REFERER'],
          $_SERVER['HTTP_X_FORWARDED_FOR'], $_SERVER['REMOTE_ADDR']);
}

// ------------------------------------------------------------------
echo "\n=== requestFromSite() ===\n";
// ------------------------------------------------------------------

resetServer();
check('оба заголовка пусты (curl-бот) → отказ', requestFromSite(), false);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://es-trans.ru/vacancy-driver.html';
check('свой Referer → пропуск', requestFromSite(), true);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://www.es-trans.ru/services-customs.html';
check('свой Referer с www → пропуск', requestFromSite(), true);

resetServer();
$_SERVER['HTTP_ORIGIN'] = 'https://es-trans.ru';
check('только Origin, Referer пуст → пропуск', requestFromSite(), true);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://es-trans.ru/';
check('Referer = главная (как у бота id 2) → пропуск, это валидный домен',
    requestFromSite(), true);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://spam.example/attack.html';
check('чужой Referer → отказ', requestFromSite(), false);

resetServer();
$_SERVER['HTTP_ORIGIN']  = 'https://spam.example';
$_SERVER['HTTP_REFERER'] = 'https://spam.example/x';
check('оба чужие → отказ', requestFromSite(), false);

resetServer();
$_SERVER['HTTP_ORIGIN']  = 'https://spam.example';
$_SERVER['HTTP_REFERER'] = 'https://es-trans.ru/vacancy-driver.html';
check('Origin чужой, но Referer свой → пропуск (не режем живых)',
    requestFromSite(), true);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://es-trans.ru.evil.com/x';
check('домен-подделка es-trans.ru.evil.com → отказ', requestFromSite(), false);

resetServer();
$_SERVER['HTTP_REFERER'] = 'мусор-не-url';
check('мусор вместо URL → отказ', requestFromSite(), false);

resetServer();
$_SERVER['HTTP_REFERER'] = 'https://ES-TRANS.RU/contacts.html';
check('домен в верхнем регистре → пропуск', requestFromSite(), true);

// ------------------------------------------------------------------
echo "\n=== rateLimitOk() ===\n";
// ------------------------------------------------------------------

$dir = sys_get_temp_dir() . '/rl-test-' . getmypid();
@mkdir($dir, 0700, true);

resetServer();
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';

$cfg = ['rate_limit' => ['dir' => $dir, 'max_per_window' => 3, 'window_seconds' => 600]];

check('1-й запрос → пропуск', rateLimitOk($cfg), true);
check('2-й запрос → пропуск', rateLimitOk($cfg), true);
check('3-й запрос → пропуск', rateLimitOk($cfg), true);
check('4-й запрос сверх лимита → отказ', rateLimitOk($cfg), false);
check('5-й запрос тоже отказ', rateLimitOk($cfg), false);

// Другой IP не должен наследовать чужой лимит.
$_SERVER['REMOTE_ADDR'] = '203.0.113.99';
check('другой IP → пропуск (лимит по каждому IP отдельно)', rateLimitOk($cfg), true);

// Файл не должен содержать IP открытым текстом.
$files = glob($dir . '/*.json');
$namesOk = true;
foreach ($files as $f) {
    if (strpos(basename($f), '203.0.113') !== false) $namesOk = false;
}
check('имя файла не содержит IP (хеш, а не адрес)', $namesOk, true);

// Отказоустойчивость.
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';
check('каталога нет → пропуск, а не отказ',
    rateLimitOk(['rate_limit' => ['dir' => '/nonexistent/nope', 'max_per_window' => 1]]),
    true);

check('лимит = 0 (выключен) → пропуск',
    rateLimitOk(['rate_limit' => ['dir' => $dir, 'max_per_window' => 0]]),
    true);

check('конфига rate_limit нет вовсе → пропуск (дефолтный каталог отсутствует)',
    rateLimitOk([]), true);

// Истечение окна: подкладываем отметки за пределами окна.
$_SERVER['REMOTE_ADDR'] = '203.0.113.55';
$stale = $dir . '/' . hash('sha256', '203.0.113.55') . '.json';
file_put_contents($stale, json_encode([time() - 5000, time() - 4000, time() - 3000]));
check('старые отметки вне окна не считаются → пропуск',
    rateLimitOk(['rate_limit' => ['dir' => $dir, 'max_per_window' => 3, 'window_seconds' => 600]]),
    true);

// Битый файл не должен ронять обработчик.
$_SERVER['REMOTE_ADDR'] = '203.0.113.66';
$broken = $dir . '/' . hash('sha256', '203.0.113.66') . '.json';
file_put_contents($broken, '{не json![');
check('битый файл счётчика → пропуск, без падения',
    rateLimitOk(['rate_limit' => ['dir' => $dir, 'max_per_window' => 3, 'window_seconds' => 600]]),
    true);

// X-Forwarded-For: за прокси Timeweb лимит должен считаться по реальному IP.
resetServer();
$_SERVER['REMOTE_ADDR'] = '10.0.0.1';                 // адрес прокси
$_SERVER['HTTP_X_FORWARDED_FOR'] = '198.51.100.5, 10.0.0.1';
$cfg1 = ['rate_limit' => ['dir' => $dir, 'max_per_window' => 1, 'window_seconds' => 600]];
rateLimitOk($cfg1);
check('за прокси лимит считается по X-Forwarded-For, а не по адресу прокси',
    rateLimitOk($cfg1), false);

// Уборка
array_map('unlink', glob($dir . '/*.json') ?: []);
@rmdir($dir);

// ------------------------------------------------------------------
echo "\n================================\n";
echo "Пройдено: $pass, провалено: $fail\n";
exit($fail === 0 ? 0 : 1);
