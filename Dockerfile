FROM php:8.2-apache

RUN a2enmod rewrite headers expires

COPY ./ /var/www/html/

# Critical: Allow .htaccess
RUN sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/sites-available/000-default.conf
RUN echo "DirectoryIndex index.php" >> /etc/apache2/mods-enabled/dir.conf

RUN chown -R www-data:www-data /var/www/html && chmod -R 755 /var/www/html

EXPOSE 80
CMD ["apache2-foreground"]
