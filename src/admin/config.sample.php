<?php
/**
 * Copy this file to config.php and fill in your details.
 * config.php holds a password, so keep it out of git (.gitignore covers it).
 */

return [
    // From cPanel > MySQL Databases. Names include your account prefix.
    'db_host'     => 'localhost',
    'db_name'     => 'youracct_familytree',
    'db_user'     => 'youracct_ftadmin',
    'db_password' => '',

    // Where the rebuilt JSON files are written, relative to the admin folder.
    // '..' means the site root, next to index.html.
    'site_root'   => '..',

    // Set to true only while setting up the first user, then back to false.
    'allow_setup' => false,
];
