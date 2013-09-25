var async = require('async'),
    cheerio = require('cheerio'),
    _ = require('underscore'),
    request = require('request'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    articleQueue,
    searchQueue,
    retried = {},
    AUTHOR = process.env.AUTHOR;

function scrapeSearch(uri, callback) {
    console.log('Loading: ' + uri);
    request({
        uri: uri
    }, function(err, response, body) {
        var $,
            href,
            articles;

        if (err) {
            console.log(err);
            process.exit(1);
        } else {
            $ = cheerio.load(body);

            articles = $('.authors-articles h3 a');

            _.each(articles, function(article) {
                var title,
                    uri;

                article = $(article);

                title = article.text();
                uri = url.parse(article.attr('href'));

                uri.search = undefined;

                articleQueue.push({
                    title: url.format(uri),
                    uri: 'http://www.computerworld.co.nz' + url.format(uri)
                });
            });

            href = $('.pagination a.next').attr('href');

            if (href) {
                href = 'http://www.computerworld.co.nz' + href;
                articleQueue.push({
                    search: true,
                    uri: href
                });
            }

            callback();
        }
    });
}

function downloadArticle(task, callback) {
    var title = task.title,
        uri = task.uri;


    // skip former title acts
    if (task.search) {
        searchQueue.push(uri);
        return callback();
    }

    console.log("Requesting %s with %d items still in the queue and %d workers.", uri, articleQueue.length(), articleQueue.concurrency);
    request({
        uri: uri
    }, function(err, response, body) {
        if (err || Math.floor(response.statusCode / 100) !== 2) {
            console.error("Couldn't download " + uri + ' because ' + err);
            callback();
            if (!retried[uri]) {
                retried[uri] = true;
                articleQueue.push(uri);
            }
        } else {
            updateArticle(title, body, callback);
        }
    });
}

function updateArticle(file, html, callback) {
    file = file.replace(/^\//, '').replace(/\/$/, '');
    console.log("Updating %s to new content", file);
    mkdirp(path.dirname(file), function(err) {
        fs.writeFile(file + '.html', html, function(err) {
            if (err) {
                console.log("Error updating: %s", JSON.stringify(err));
            } else {
                console.log("Successfully updated %s", file);
            }
            callback(err);
        });
    });
}

searchQueue = async.queue(scrapeSearch);

articleQueue = async.queue(downloadArticle, process.env.QUEUE_SIZE || 1);

searchQueue.push('http://www.computerworld.co.nz/author/334791916/' + AUTHOR + '/articles');
