var fs = require('fs');
var crypto = require('crypto');
var GAPI = require('node-gcs').gapitoken;
var GCS = require('node-gcs');
var request = require('request');
var mime = require('mime');

function _parseGcsUrl(url) {
    url = url.replace('gs://', '');
    var data = {};
    var bits = url.split('/');

    data.bucket = bits.shift();
    data.path = bits.join('/');

    return data;
}

// @todo follow 301 and 302 redirects
function _download(url, callback) {
    request.head(url, function(err, resp) {
        if (err) {
            callback(err);
            return;
        }

        if (resp.statusCode >= 400) {
            callback('Remote file is not valid');
            return;
        }

        var tmpPath = url.split('/').pop();
        request(url).pipe(fs.createWriteStream(tmpPath)).on('close', function() {
            callback(null, tmpPath, true);
        });
    });
}

function CloudStorage(options) {
    this.options = options;

    // reformat options for gapi token module
    this.gapiOptions = {
        iss: options.accessId,
        scope: options.scope || 'https://www.googleapis.com/auth/devstorage.full_control',
        keyFile: options.privateKey
    };

    this.privateKey = null;
    this.gapi = null;
}

CloudStorage.prototype.getUrl = function(gcsUrl) {
    var data = _parseGcsUrl(gcsUrl);
    return 'http://' + data.bucket + '.storage.googleapis.com/' + data.path;
};

// @see http://stackoverflow.com/questions/20754279/creating-signed-urls-for-google-cloud-storage-using-nodejs
CloudStorage.prototype.getSignedUrl = function(gcsUrl, options) {
    var self = this;

    options = options || {};

    // default to one hour
    if (!options.hasOwnProperty('expiration')) {
        options.expiration = 3600;
    }

    var data = _parseGcsUrl(gcsUrl);

    var expiry = Math.round((new Date().getTime() / 1000) + options.expiration);
    var stringPolicy = "GET\n" + "\n" + "\n" + expiry + "\n" + '/' + data.bucket + '/' + data.path;

    // synchronous but only the first time this runs
    if (!self.privateKey) {
        self.privateKey = fs.readFileSync(self.options.privateKey, 'utf-8');
    }

    var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(self.privateKey, 'base64'));
    var fullUrl = (options.secure || options.ssl) ? 'https://' : 'http://';
    fullUrl += data.bucket + '.storage.googleapis.com/' + data.path + '?GoogleAccessId=' + self.options.accessId + '&Expires=' + expiry + '&Signature=' + signature;

    if (options.download) {
        var filename = options.filename || gcsUrl.split('/').pop();
        fullUrl += '&response-content-disposition=' + encodeURIComponent('attachment; filename="' + filename + '"');
    }

    return fullUrl;
};

CloudStorage.prototype.copy = function(src, destination, options, callback) {
    var self = this;

    if (callback === undefined) {
        callback = options;
        options = undefined;
    }

    callback = callback || function() {};

    if (options === undefined) {
        options = {};
    }

    // if the src looks like a url
    if (src.indexOf('//') === 0) {
        src = 'http:' + src;
    }

    function _onFileReady(err, path, removeAfterCopy) {
        if (err) {
            callback(err);
            return;
        }

        if (removeAfterCopy) {
            options.removeAfterCopy = true;
        }

        fs.stat(path, function(err, stat) {
            _onStat(err, path, stat);
        });
    }

    function _onStat(err, path, stat) {
        if (err) {
            callback(err);
            return;
        }

        if (!self.gapi) {
            self.gapi = new GAPI(self.gapiOptions, function(err) {
                if (err) {
                    callback(err);
                    return;
                }

                _copy(path, stat);
            });
            return;
        }

        _copy(path, stat);
    }

    function _copy(path, stat) {

        // go go go go
        var stream = fs.createReadStream(path);
        var headers = {
            'Content-Length': stat.size,
            'Content-Type': mime.lookup(path),
            'Cache-Control': 'public, max-age=3600, no-transform',
            'X-Goog-Acl': 'public-read'
        };

        var key;
        if (options.hasOwnProperty('headers')) {
            for (key in options.headers) {
                if (options.headers.hasOwnProperty(key)) {
                    headers[key] = options.headers[key];
                }
            }
        }

        if (options.hasOwnProperty('metadata')) {
            for (key in options.metadata) {
                if (options.metadata.hasOwnProperty(key)) {
                    headers['X-Goog-Meta-' + key] = options.metadata[key];
                }
            }
        }

        var destinationData = _parseGcsUrl(destination);

        var gcs = new GCS(self.gapi);
        gcs.putStream(stream, destinationData.bucket, '/' + destinationData.path, headers, function(err, res, body) {
            if (err) {
                callback(err, res, body);
                return;
            }

            if (res.statusCode >= 400) {
                callback(body);
                return;
            }

            var isPublic = headers['X-Goog-Acl'].indexOf('public-') === 0;

            if (options.removeAfterCopy) {
                fs.unlink(path, function() {
                    callback(null, isPublic ? self.getUrl(destination) : self.getSignedUrl(destination));
                });
                return;
            }

            callback(null, isPublic ? self.getUrl(destination) : self.getSignedUrl(destination));
        });
    }

    // @todo figure out a way to make this more efficient
    // like posting the stream directly to google cloud storage
    if (/^https?:\/\//.test(src)) {
        _download(src, _onFileReady);
        return;
    }

    _onFileReady(null, src);
};

CloudStorage.prototype.remove = function(path, callback) {
    var self = this;

    callback = callback || function() {};

    function _remove(path) {
        var gcs = new GCS(self.gapi);
        var data = _parseGcsUrl(path);

        gcs.deleteFile(data.bucket, '/' + data.path, function(err, resp, body) {
            if (err) {
                callback(err, false);
                return;
            }

            if (resp.statusCode >= 400) {
                callback(body, false);
                return;
            }

            callback(null, true);
        });
    }

    if (!self.gapi) {
        self.gapi = new GAPI(self.gapiOptions, function(err) {
            if (err) {
                callback(err, false);
                return;
            }

            _remove(path);
        });
        return;
    }

    _remove(path);
};

module.exports = CloudStorage;
