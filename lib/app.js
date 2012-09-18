function trelloBaseApp(config) {
    var express = require('express');
    var RedisStore = require('connect-redis')(express);
    var sts = require('connect-sts');

    var Models = require('./models');

    var app = express.createServer();

    var trello = require('./trello')(config.trello.key, config.trello.secret);

    app.use(express.cookieParser());
    app.use(express.bodyParser());

    var maxAge = 3600000 * 24 * 30 * 12;
    app.use(sts(maxAge, false));
    app.use(express.session({secret: config.trello.secret,
                             cookie: {maxAge: maxAge},
                             store: new RedisStore(config.redis)}));

    app.use(require('./session').middleware(config));
    app.use(trello.middleware());

    app.configure('development', function() {
        app.use(express.errorHandler({
            dumpExceptions: true,
            showStack: true
        }));
    });

    app.configure('production', function() {
        app.use(express.errorHandler());
    });

    /**
     * Start the authentication dance
     */
    app.get('/login', function(req, res) {
        trello.requestToken(function(error, token, tokenSecret) {
            if (error) return res.send("error", 500);
            req.session.tokenSecret = tokenSecret;
            res.redirect(trello.redirect(token, {
                name: 'Trello calendar',
                expiration: 'never',
                scope: 'read,write',
                return_url: config.url+'/login/callback'
            }));
        });
    });

    /**
     * OAuth callback
     */
    app.get('/login/callback', function(req, res) {
        trello.accessToken(req.query.oauth_token,
                           req.session.tokenSecret,
                           req.query.oauth_verifier,
                           function(error, token, tokenSecret) {
                               if (error) return res.send("error", 500);
                               req.store(token, function(id, error, result) {
                                   if (error) return res.send("error", 500);
                                   req.session.uuid = id;
                                   res.redirect('/');
                               });
                           });
    });

    /**
     * Unauthorize the application
     */
    app.delete('/deauthorize', function(req, res) {
        if (!req.trello) return res.send("no session", 401);
        req.trello.del('/tokens/'+ req.accessToken, function(err, data) {
            if (err) return res.send("error", 500);
            req.remove(req.session.uuid, function(err) {
                if (err) return res.send("redis error", 500);
                req.session.uuid = null;
                res.send("", 204);
            });
        });
    });
    return app;
}

module.exports = trelloBaseApp;
