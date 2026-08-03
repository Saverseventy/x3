FROM php:8.3-apache

# Install system dependencies for PHP extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# Install required PHP extensions
RUN docker-php-ext-install -j$(nproc) curl mbstring

# Configure Apache — enable modules & fix directory access (stops 403 errors)
RUN a2enmod rewrite headers expires \
    && echo "<Directory /var/www/html>" > /etc/apache2/conf-available/allow.conf \
    && echo "    Options Indexes FollowSymLinks" >> /etc/apache2/conf-available/allow.conf \
    && echo "    AllowOverride All" >> /etc/apache2/conf-available/allow.conf \
    && echo "    Require all granted" >> /etc/apache2/conf-available/allow.conf \
    && echo "</Directory>" >> /etc/apache2/conf-available/allow.conf \
    && a2enconf allow

# PHP configuration — allow URL fetch for m3u.work + proper limits
RUN echo "allow_url_fopen = On" > /usr/local/etc/php/conf.d/iptv.ini \
 && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "default_socket_timeout = 30" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "user_agent = \"Mozilla/5.0 IPTV/1.0\"" >> /usr/local/etc/php/conf.d/iptv.ini

# Copy application files
COPY . /var/www/html/

# Permissions — allow cache file creation inside container
RUN chown -R www-data:www-data /var/www/html \
 && find /var/www/html -type d -exec chmod 755 {} \; \
 && find /var/www/html -type f -exec chmod 644 {} \; \
 && chmod 755 /var/www/html

EXPOSE 80
