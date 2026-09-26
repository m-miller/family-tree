<?php
/**
 * Creates the first admin account, then refuses to run again.
 * Set 'allow_setup' => true in config.php, visit this page once,
 * then set it back to false.
 */

require_once __DIR__ . '/lib/layout.php';
require_once __DIR__ . '/lib/errors.php';

install_error_handlers();

$count = (int) fetch_one('SELECT COUNT(*) AS n FROM users')['n'];
if ($count > 0) {
    page_header('Setup', false);
    echo '<p>An account already exists, so setup is closed. <a href="login.php">Sign in</a>.</p>';
    page_footer();
    exit;
}
if (!config('allow_setup')) {
    page_header('Setup', false);
    echo '<p>Setup is disabled. Set <code>allow_setup</code> to true in admin/config.php to create the first account.</p>';
    page_footer();
    exit;
}

$errors = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirm  = $_POST['confirm'] ?? '';

    if ($username === '') {
        $errors[] = 'Choose a username.';
    }
    if (strlen($password) < 12) {
        $errors[] = 'Use a password of at least 12 characters.';
    }
    if ($password !== $confirm) {
        $errors[] = 'The two passwords do not match.';
    }
    if (!$errors) {
        query('INSERT INTO users (username, password_hash) VALUES (?, ?)',
              [$username, password_hash($password, PASSWORD_DEFAULT)]);
        flash('Account created. Set allow_setup back to false in admin/config.php.');
        redirect('login.php');
    }
}

page_header('Create the first account', false);
foreach ($errors as $e) {
    echo '<p class="flash error">' . h($e) . '</p>';
}
?>
<form method="post" class="narrow">
	<?= csrf_field() ?>
	<label>Username<input type="text" name="username" autocomplete="username" required></label>
	<label>Password<input type="password" name="password" autocomplete="new-password" required></label>
	<label>Repeat the password<input type="password" name="confirm" autocomplete="new-password" required></label>
	<button type="submit">Create account</button>
</form>
<?php page_footer();
