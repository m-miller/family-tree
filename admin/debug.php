<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

echo 'PHP ', PHP_VERSION, "<br>\n";
echo 'config.php exists: ', var_export(file_exists(__DIR__ . '/config.php'), true), "<br>\n";

require __DIR__ . '/lib/db.php';
echo 'connected<br>', "\n";

$tables = fetch_all('SHOW TABLES');
echo 'tables: ', implode(', ', array_map('current', $tables)), "<br>\n";

echo 'users rows: ', fetch_one('SELECT COUNT(*) AS n FROM users')['n'], "<br>\n";
echo 'people rows: ', fetch_one('SELECT COUNT(*) AS n FROM people')['n'], "<br>\n";
echo 'site_root writable: ', var_export(is_writable(config('site_root')), true), "<br>\n";