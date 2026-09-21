<?php
require_once __DIR__ . '/lib/auth.php';
logout();
header('Location: login.php');
