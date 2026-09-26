<?php
/** Sessions, login checks and CSRF tokens. */

require_once __DIR__ . '/db.php';

function start_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}

function current_user()
{
    start_session();
    return $_SESSION['user'] ?? null;
}

function require_login()
{
    if (current_user() === null) {
        header('Location: login.php');
        exit;
    }
}

function attempt_login($username, $password)
{
    $user = fetch_one('SELECT id, username, password_hash FROM users WHERE username = ?', [$username]);
    // Always run a hash comparison so a wrong username and a wrong password
    // take the same amount of time.
    $hash = $user['password_hash'] ?? '$2y$10$usesomesillystringfor.no.match.at.all.placeholderxxxxxxxxxxxx';
    if (!password_verify($password, $hash) || $user === null) {
        return false;
    }
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        query('UPDATE users SET password_hash = ? WHERE id = ?',
              [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['user'] = ['id' => $user['id'], 'username' => $user['username']];
    query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
    return true;
}

function logout()
{
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        setcookie(session_name(), '', time() - 42000, '/');
    }
    session_destroy();
}

function csrf_token()
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field()
{
    return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">';
}

/** Call at the top of every POST handler. */
function check_csrf()
{
    start_session();
    $sent = $_POST['csrf'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        http_response_code(400);
        exit('Your session expired. Go back, reload the page and try again.');
    }
}

/** Escape for HTML output. */
function h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
