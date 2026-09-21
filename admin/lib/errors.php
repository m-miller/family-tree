<?php
/**
 * Turns fatal errors into a readable page.
 *
 * Shared hosting often hides PHP errors and writes no log, which leaves a
 * blank 500 and nothing to go on. These handlers catch the error and say
 * what happened. Details are only shown to a signed-in admin.
 */

require_once __DIR__ . '/auth.php';

function install_error_handlers()
{
    set_exception_handler('report_fatal_exception');
    register_shutdown_function('report_fatal_shutdown');
}

function report_fatal_exception($e)
{
    render_fatal(get_class($e) . ': ' . $e->getMessage(), $e->getFile(), $e->getLine());
}

function report_fatal_shutdown()
{
    $error = error_get_last();
    if ($error === null || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    render_fatal($error['message'], $error['file'], $error['line']);
}

function render_fatal($message, $file, $line)
{
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
    }
    $signed_in = current_user() !== null;
    echo '<div style="font-family:Verdana,sans-serif;font-size:.85rem;border:2px solid #a10000;'
       . 'background:#fff4f4;padding:1rem;margin:1rem">';
    echo '<strong>Something went wrong.</strong><br>';
    if ($signed_in) {
        echo '<p style="white-space:pre-wrap">' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
        echo '<p>' . htmlspecialchars(basename($file), ENT_QUOTES, 'UTF-8') . ' line ' . (int) $line . '</p>';
        if (stripos($message, 'memory') !== false) {
            echo '<p>This looks like the memory limit. The rebuild page can tell you the '
               . 'current limit and how much it needed.</p>';
        }
    } else {
        echo '<p>Sign in to see the details.</p>';
    }
    echo '<p><a href="index.php">Back to the admin</a></p></div>';
}
