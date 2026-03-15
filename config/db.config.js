module.exports = {
    DB: process.env.DB_NAME || 'dev_astropulse',
    USER:  process.env.DB_USER || 'astro_user',
    PASSWORD: process.env.DB_PSSWORD || 'admin',
    PORT: process.env.DB_PORT || 3306,
    HOST: process.env.DB_HOST || '127.0.0.1',

    dialect: 'mysql',
    innodb_log_file_size: '512M',

    pool : {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
}
