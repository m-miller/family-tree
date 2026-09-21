<?php
require_once __DIR__ . '/lib/layout.php';
require_once __DIR__ . '/lib/errors.php';

install_error_handlers();

if (current_user()) {
    redirect('index.php');
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    if (attempt_login($username, $password)) {
        redirect('index.php');
    }
    // Deliberately vague, and slow, to discourage guessing.
    sleep(1);
    $error = 'That username and password did not match.';
}

page_header('Sign in', false);
if ($error) {
    echo '<p class="flash error">' . h($error) . '</p>';
}
?>
<form method="post" class="narrow">
	<?= csrf_field() ?>
	<label>Username<input type="text" name="username" autocomplete="username" autofocus required></label>
	<label>Password<input type="password" name="password" autocomplete="current-password" required></label>
	<button type="submit">Sign in</button>
</form>
<?php page_footer();
