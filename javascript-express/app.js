require('dotenv').config();
var https = require('https');
var express = require('express');
var app = express();

// Configure View and Handlebars
app.set('views', __dirname + '/views');
var exphbs = require('express-handlebars');
var hbs = exphbs.create({});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Create body parsers for application/json and application/x-www-form-urlencoded
var bodyParser = require('body-parser')
app.use(bodyParser.json())
var urlencodedParser = bodyParser.urlencoded({ extended: false })

var ringcentral = require('ringcentral');

var useTls = process.env.MY_APP_TLS_ENABLED > 0 ? true : false;
var server = null;
var port = process.env.MY_APP_PORT;

var subscribed = false;

if (useTls) {
  var tls = require('tls'),
      fs = require('fs');
  server = https.createServer({
    key: fs.readFileSync(process.env.MY_APP_TLS_PRIVATE_KEY),
    cert: fs.readFileSync(process.env.MY_APP_TLS_PUBLIC_CERT)
  }, app).listen(port, function() {
    console.log('LISTEN_HTTPS ' + port);    
  });
} else if (! useTls) {
  server = require('http').Server(app);
  server.listen(port, function() {
    console.log('LISTEN_HTTP ' + port);    
  });
}

var rcsdk = new ringcentral({
  server: process.env.RC_APP_SERVER_URL,
  appKey: process.env.RC_APP_KEY,
  appSecret: process.env.RC_APP_SECRET
});

app.get('/', function(req, res) {
  // Get token for display after OAuth
  token = rcsdk.platform().auth().data();
  token_json = token['access_token'] ? JSON.stringify(token, null, ' ') : '';

  // Render home page with params
  res.render('index', {
    authorize_uri: rcsdk.platform().authUrl({
      redirectUri: process.env.RC_APP_REDIRECT_URL
    }),
    redirect_uri: process.env.RC_APP_REDIRECT_URL,
    token_json: token_json,
    webhook_uri: process.env.MY_APP_WEBHOOK_URL
  });
});

app.get('/callback', function(req, res) {
  if (req.query.code) {
    rcsdk.platform()
      .login({
        code: req.query.code,
        redirectUri: process.env.RC_APP_REDIRECT_URL
      })
      .then(function(response) {
        console.log('logged_in');
        res.send('');
      })
      .catch(function(e) {
        console.log('ERR_CALLBACK ' + e.message  || 'Server cannot authorize user');
        res.send('');
      });
  }
});

app.get('/hooks', function(req, res) {
  rcsdk.platform().loggedIn()
    .then(function(status) {
      rcsdk.platform()
        .send({
          method: 'GET',
          url: '/subscription'
        })
        .then(function(response) {
          console.log('logged_in');
          var text = response.text();
          res.send(text);
        })
        .catch(function(e) {
          console.log('ERR ' + e.message  || 'Server cannot authorize user');
          res.send('ERROR');
        });
    })
    .catch(function(e) {
      res.send("E_NOT_LOGGED_IN");
    }); 
});

app.post('/hook', function(req, res) {
  console.log('/hook called');
  var header = 'Validation-Token';
  console.log('Validation-Token: ' + req.get('Validation-Token'));
  if (req.get(header)) {
    res.set(header, req.get(header));
    res.send('');
  }
  console.log(req.get('Content-Type'));
  if (req.get('Content-Type').match(/application\/json/)) {
    console.log(JSON.stringify(req.body, null, 2));
  }
  rcsdk.platform().loggedIn()
    .then(function(status) {
      rcsdk.platform()
        .send({
          method: 'GET',
          url: '/subscription'
        })
        .then(function(response) {
          console.log('logged_in');
          var text = response.text();
          res.send(text);
        })
        .catch(function(e) {
          console.log('ERR ' + e.message  || 'Server cannot authorize user');
          res.send('ERROR');
        });
    })
    .catch(function(e) {
      res.send("E_NOT_LOGGED_IN");
    }); 
});

app.post('/create_hook', urlencodedParser, function(req, res) {
  var requestBodyJson = req.body.requestBodyJson;
  var requestBodyData = JSON.parse(requestBodyJson);
  rcsdk.platform()
    .post('/subscription', requestBodyData)
    .then(function(response) {
      console.log('Subscribed');
      console.log(response.text());
      res.send(response.text());
    })
    .catch(function(e) {
      console.log('Subscription Error');
      console.log(e);
      res.send(e);
    })
});

app.post('/renew_hook', urlencodedParser, function(req, res) {
  var subscriptionId = req.body.subscriptionId || '';
  if (subscriptionId.match(/^[0-9a-f-]+$/)) {
    rcsdk.platform()
      .send({
        method: 'PUT',
        url: '/subscription/' + subscriptionId,
        headers: {'Content-Type': 'application/json'},
        body: '{}'
      })
      .then(function(response) {
        console.log('RENEW THEN');
        res.send('RENEW THEN: ' + subscriptionId);
      })
      .catch(function(e) {
        console.log('RENEW CATCH');
        console.log(e);
        res.send('RENEW CATCH: ' + e);
      }) 
  } else {
    console.log('RENEW ELSE');
    res.sendStatus(400);
  }
});

app.post('/delete_hook', urlencodedParser, function(req, res) {
  var subscriptionId = req.body.subscriptionId || '';
  if (subscriptionId.match(/^[0-9a-f-]+$/)) {
    rcsdk.platform()
      .delete('/subscription/' + subscriptionId)
      .then(function(response) {
        console.log('DELETE THEN');
        res.send('DELETE THEN: ' + subscriptionId);
      })
      .catch(function(e) {
        console.log('DELETE CATCH');
        console.log(e);
        res.send('DELETE CATCH: ' + e);
      }) 
  } else {
    console.log('DELETE ELSE');
    res.sendStatus(400);
  }
});
