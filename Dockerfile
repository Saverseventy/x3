FROM php:8.3-apache

# Install system dependencies required for PHP extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libonig-dev \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install -j$(nproc) curl mbstring

# Enable Apache modules & fix directory permissions
RUN a2enmod rewrite headers expires \
    && echo "<Directory /var/www/html>" > /etc/apache2/conf-available/allow.conf \
    && echo "    Options Indexes FollowSymLinks" >> /etc/apache2/conf-available/allow.conf \
    && echo "    AllowOverride All" >> /etc/apache2/conf-available/allow.conf \
    && echo "    Require all granted" >> /etc/apache2/conf-available/allow.conf \
    && echo "</Directory>" >> /etc/apache2/conf-available/allow.conf \
    && a2enconf allow

# PHP configuration
RUN echo "allow_url_fopen = On" > /usr/local/etc/php/conf.d/iptv.ini \
 && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "default_socket_timeout = 30" >> /usr/local/etc/php/conf.d/iptv.ini \
 && echo "user_agent = \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\"" >> /usr/local/etc/php/conf.d/iptv.ini

# Copy application files
COPY . /var/www/html/

# Set correct file/directory permissions
RUN chown -R www-data:www-data /var/www/html \
 && find /var/www/html -type d -exec chmod 755 {} \; \
 && find /var/www/html -type f -exec chmod 644 {} \;

EXPOSE 80
