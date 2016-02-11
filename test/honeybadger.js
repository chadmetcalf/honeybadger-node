

var assert = require('assert'),
    sinon  = require('sinon'),
    nock   = require('nock'),
    Badger = require('../lib/honeybadger');

suite('node.js honeybadger.io notifier', function () {
  var api, payloadCount, payloads = [];

  setup(function () {
    payloadCount = 0;
    payloads = [];

    // Don't send actual requests to honeybadger.io from the test suite
    nock.cleanAll();
    var api = nock("https://api.honeybadger.io")
      .post("/v1/notices")
      .reply(function(uri, requestBody) {
        payloads.push(requestBody);
        return [201, '{"id":"1a327bf6-e17a-40c1-ad79-404ea1489c7a"}'];
      });
  });

  suite('Creating a Badger without an API key', function () {
    var hb = new Badger({
          apiKey: null,
          server: { testmeta: 'data' }
        }),
        payloadCount = payloads.length;

    test('makes it a no-op when used', function (done) {
      hb.once('sent', function () {
        throw new Error('This event should not fire!');
      });
      hb.send(new Error('test error 1'));
      setTimeout(function () {
        assert(payloads.length === payloadCount, 'Payload was sent without API key');
        done();
      }, 10);
    });
  });

  suite('logging', function () {
    test('logs info on success', function (done) {
      var spy = sinon.spy(),
          hb = new Badger({
            apiKey: 'faked',
            logger: {info: spy}
          });

      hb.once('sent', function () {
        sinon.assert.calledOnce(spy);
        done();
      });

      hb.send(new Error('test error'));
    });

    test('logs error on remote failure', function (done) {
      var spy = sinon.spy(),
          hb = new Badger({
            apiKey: 'faked',
            logger: {error: spy}
          });

      nock.cleanAll();
      nock("https://api.honeybadger.io")
        .post("/v1/notices")
        .reply([403, '']);

      hb.once('remoteError', function () {
        sinon.assert.calledOnce(spy);
        done();
      });

      hb.send(new Error('test error'));
    });

    test('logs error on exception', function (done) {
      var spy = sinon.spy(),
          hb = new Badger({
            apiKey: 'faked',
            logger: {error: spy}
          });

      nock.cleanAll();
      nock("https://api.honeybadger.io")
        .post("/v1/notices")
        .replyWithError("boom");

      hb.once('error', function () {
        sinon.assert.calledOnce(spy);
        done();
      });

      hb.send(new Error('test error'));
    });
  });

  suite('Creating a Badger with server metadata', function () {
    var hb = new Badger({
          // Because we've mocked the POST, the API key here only needs to be
          // non-falsy.
          apiKey: 'fake api key',
          server: {
            name: 'honeybadge',
            role: 'testing'
          },
        });

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 2', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 2'));
    });

    test('the server metadata is added to the payload', function () {
      hb.once('sent', function () {
        var s = payloads[payloads.length - 1];
        assert(s.server.name === 'honeybadge', 'Server name not set.');
        assert(s.server.role === 'testing', 'Server role not set.');
        done();
      });
    });
  });

  suite('Creating a Badger with development environments', function () {
    var hb_options = {
      apiKey: 'fake api key',
      server: { name: 'honeybadger' },
      developmentEnvironments: ['development', 'test']
    };

    test('successfully sends the payload in non-dev environments', function (done) {
      hb_options.server.environment_name = 'production';
      var hb = new Badger(hb_options),
          payloadCount = payloads.length;

      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error dev-env', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error dev-env'));
    });

    test('makes it a no-op in dev environments', function (done) {
      hb_options.server.environment_name = 'development';
      var hb = new Badger(hb_options),
          payloadCount = payloads.length;

      hb.once('sent', function () {
        throw new Error('This event should not fire!');
      });
      hb.send(new Error('test error dev-env'));
      setTimeout(function () {
        assert(payloads.length === payloadCount, 'Payload was sent in a dev environment');
        done();
      }, 10);
    });
  });

  suite('Creating a Badger with a custom notifier', function () {
    var hb = new Badger({
      apiKey: 'fake api key',
      server: { name: 'honeybadger' },
      notifier: {
        name: 'honeybadger test suite',
        url: 'https://notarealsite.net/page14.php',
        version: '0.4.18'
      }
    });

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 3', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 3'));
    });

    test('correctly sets the notifier field in the payload', function () {
      hb.once('sent', function () {
        var n;
        n = payloads[payloads.length - 1].notifier;
        assert(n.name === 'honeybadger test suite', 'name not set');
        assert(n.url === 'https://notarealsite.net/page14.php', 'url not set');
        assert(n.version === '0.4.18', 'version not set');
        done();
      });
    });
  });

  suite('Passing contextual metadata with an error', function () {
    var hb = new Badger({ apiKey: 'fake api key' });

    var meta = {
      context: {
        uid: '0xdeadbeef',
        email: 'test@testing.biz'
      },
      session: {
        id: '1234567890',
        data: {a: 1, b: 2, c: 3}
      },
      params: {
        arg1: 'hello'
      },
      cookies: {
        omnom: 'nom'
      }
    };

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 4', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 4'), meta);
    });

    test('The contextual metadata is passed correctly', function () {
      hb.once('sent', function () {
        var p = payloads[payloads.length - 1];
        assert.deepEqual(p.request, meta, 'Metadata incorrect');
        done();
      });
    });
  });

  suite('Creating a Badger with cgi_data meta', function () {
    var hb = new Badger({
      apiKey: 'fake api key',
      server: { name: 'honeybadger' }
    });

    var sampleCGIData = {
      'server-software': 'Whatever server',
      'custom': 'custom fields with custom DATA, !#&*'
    };

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 5', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 5'), { cgi_data: sampleCGIData });
    });

    test('transforms data keys according to the RFC 3875', function () {
      hb.once('sent', function () {
        var n;
        n = payloads[payloads.length - 1].request.cgi_data;
        assert(n['SERVER_SOFTWARE'] === sampleCGIData['server-software'], 'server-software not set');
        assert(n['CUSTOM'] === sampleCGIData['custom'], 'custom not set');
        assert(('custom' in n) === false, 'untransformed keys present in payload');
      });
    });
  });

  suite('Creating a Badger with headers meta', function () {
    var hb = new Badger({
      apiKey: 'fake api key',
      server: { name: 'honeybadger' }
    });

    var sampleHeaders = {
      'x-forwarded-for': '1.2.3.4',
      'user-agent': 'Mozilla 5.0',
      'cookie': 'a=b'
    };

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 6', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 6'), { headers: sampleHeaders });
    });

    test('correctly sets the headers field in the payload', function () {
      hb.once('sent', function () {
        var n;
        n = payloads[payloads.length - 1].request;
        assert(n.cgi_data['HTTP_X_FORWARDED_FOR'] === sampleHeaders['x-forwarded-for'], 'x-forwarded-for not set');
        assert(n.cgi_data['HTTP_USER_AGENT'] === sampleHeaders['user-agent'], 'user-agent not set');
        assert(n.cgi_data['HTTP_COOKIE'] === sampleHeaders['cookie'], 'cookie not set');
        assert(('headers' in n) === false, 'headers field is not removed from the payload');
        done();
      });
    });
  });

  suite('Creating a Badger with both cgi_data and headers meta', function () {
    var hb = new Badger({
      apiKey: 'fake api key',
      server: { name: 'honeybadger' }
    });

    var sampleCGIData = {
      'server-software': 'Whatever server',
      'custom': 'custom fields with custom DATA, !#&*'
    };

    var sampleHeaders = {
      'user-agent': 'Mozilla 5.0',
      'cookie': 'a=b'
    };

    test('successfully sends the payload', function (done) {
      payloadCount = payloads.length;
      hb.once('sent', function () {
        var p;
        assert(payloads.length === (payloadCount + 1), 'payload not sent');
        p = payloads[payloads.length - 1];
        assert(p.error.message === 'test error 6', 'payload incorrect');
        done();
      });
      hb.send(new Error('test error 6'), {
        headers: sampleHeaders,
        cgi_data: sampleCGIData
      });
    });

    test('resultig payload has combined data from headers and cgi_data', function () {
      hb.once('sent', function () {
        var n;
        n = payloads[payloads.length - 1].request;
        assert(n.cgi_data['SERVER_SOFTWARE'] === sampleCGIData['server-software'], 'server-software not set');
        assert(n.cgi_data['CUSTOM'] === sampleCGIData['custom'], 'custom  not set');
        assert(n.cgi_data['HTTP_USER_AGENT'] === sampleHeaders['user-agent'], 'user-agent not set');
        assert(n.cgi_data['HTTP_COOKIE'] === sampleHeaders['cookie'], 'cookie not set');
        assert(('custom' in n) === false, 'untransformed keys from cgi_data present in payload');
        assert(('user-agent' in n) === false, 'untransformed keys from headers present in payload');
        assert(('headers' in n) === false, 'headers field is not removed from the payload');
        done();
      });
    });
  });

  suite('Stack trace filters', function () {
    var hb = new Badger({
      apiKey: 'fake api key',
      server: {
        project_root: '/path/to/badgers'
      }
    });
    var makePayload;

    beforeEach(function() {
      payloadCount = payloads.length;
    });

    suite('Node modules', function () {
      test('always substitutes node modules', function (done) {
        var err = new Error('Testing');
        err.stack = "Error: Testing\n" +
          // The double node_modules ensures that the regexp is inclusive.
          "  at Badger (/path/to/badgers/node_modules/foo/node_modules/bar/baz.js:1:0)";
        hb.once('sent', function () {
          var p;
          assert(payloads.length === (payloadCount + 1), 'payload not sent');
          p = payloads[payloads.length - 1];
          assert(p.error.backtrace[0].file === "[NODE_MODULES]/bar/baz.js", 'node modules not substituted: ' + p.error.backtrace[0].file);
          done();
        });
        hb.send(err);
      });
    });

    suite('Outside project root', function () {
      test('does not substitute outside files', function (done) {
        var err = new Error('Testing');
        hb.once('sent', function () {
          var p;
          assert(payloads.length === (payloadCount + 1), 'payload not sent');
          p = payloads[payloads.length - 1];
          assert(!p.error.backtrace[0].file.match(/^\[PROJECT_ROOT\]/), 'project should not be substituted: ' + p.error.backtrace[0].file);
          done();
        });
        hb.send(err);
      });
    });

    suite('Inside project root', function () {
      test('substitutes files under project root', function (done) {
        var err = new Error('Testing');
        err.stack = "Error: Testing\n" +
          "  at Badger (/path/to/badgers/test/honeybadger.js:258:13)";
        hb.once('sent', function () {
          var p;
          assert(payloads.length === (payloadCount + 1), 'payload not sent');
          p = payloads[payloads.length - 1];
          assert(p.error.backtrace[0].file.match(/^\[PROJECT_ROOT\]/), 'project root not substituted: ' + p.error.backtrace[0].file);
          done();
        });
        hb.send(err);
      });
    });
  });

});
