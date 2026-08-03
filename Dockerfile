FROM php:8.3-apache

# Install system dependencies required for mbstring/curl
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions — REMOVED json (built-in in PHP 8+)
RUN docker-php-ext-install -j$(nproc) curl mbstring

# Apache Modules
RUN a2enmod rewrite headers expires

# Config — Allow URL fetch & performance
RUN echo "allow_url_fopen = On" > /usr/local/etc/php/conf.d/iptv.ini \
 && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "default_socket_timeout = 30" >> /usr/local/etc/php/conf.d/iptv.ini

# Copy files
COPY . /var/www/html/

# Permissions
RUN chown -R www-data:www-data /var/www/html \
 && chmod -R 755 /var/www/html

EXPOSE 80
