<?php
/** Database connection and small query helpers. */

function config($key = null)
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/../config.php';
        if (!file_exists($path)) {
            http_response_code(500);
            exit('admin/config.php is missing. Copy config.sample.php to config.php and fill it in.');
        }
        $config = require $path;
    }
    return $key === null ? $config : ($config[$key] ?? null);
}

function db()
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', config('db_host'), config('db_name'));
        try {
            $pdo = new PDO($dsn, config('db_user'), config('db_password'), [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            error_log('DB connection failed: ' . $e->getMessage());
            http_response_code(500);
            exit('Could not connect to the database. Check admin/config.php.');
        }
    }
    return $pdo;
}

/** Run a prepared statement. */
function query($sql, array $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function fetch_all($sql, array $params = [])
{
    return query($sql, $params)->fetchAll();
}

function fetch_one($sql, array $params = [])
{
    $row = query($sql, $params)->fetch();
    return $row === false ? null : $row;
}
