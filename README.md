# Cloud Storage

Simple wrapper for uploading and deleting files from Google Cloud Storage.

Thanks to @bsphere for https://github.com/bsphere/node-gcs

## Installation

```
npm install cloud-storage
```

## Getting Started

1.  Sign into the Google Cloud Console site: https://console.developers.google.com
2.  Go to your project and under **APIs & auth** click on **Credentials**
3.  Create an Oauth **Service Account** for your project if you don't already have one
4.  Under the **Service Account** section copy your email address (that is your `accessId`)
5.  If you do not have a private key, click `Generate new key` to generate one (this will download a .p12 file to your computer)
6.  Convert the key to a .pem file

    ```
    openssl pkcs12 -in path/to/key.p12 -nodes -nocerts > path/to/key.pem
    ```

7.  If prompted for a password enter `notasecret`
8.  Store this .pem file somewhere secret (the path to this file is your `privateKey`)

## Usage

#### Creating a cloud storage object

```javascript
var CloudStorage = require('cloud-storage');
var storage = new CloudStorage({
    accessId: '1234-abcd@developer.gserviceaccount.com',
    privateKey: '/path/to/private/key.pem'
});
```

#### Copying a file to cloud storage

```javascript
// copy a local file or a url
storage.copy('/path/to/something.jpg', 'gs://some-bucket/something.jpg', function(err, url) {
    // public url for your file
    console.log(url);
});
```

#### Deleting a file from cloud storage

```javascript
storage.remove('gs://some-bucket/something.jpg', function(err, success) {
    console.log(success);
});
```

#### Custom options and metadata

```javascript
// if you want to get crazy you can pass in options and metadata
var options = {
    headers: {
        'Cache-Control': 'public, max-age=7200, no-transform',
        'X-Goog-Acl': 'bucket-owner-full-control'
    },
    metadata: {
        'width': 100,
        'height': 100
    },

    // remove the original file on disk after it is copied
    removeAfterCopy: true,

    // force an extension to be added to the destination
    forceExtension: true
};

storage.copy('http://someurl.com/path/to/file.jpg', 'gs://some-bucket/images/file', options, function(err, url) {

});
```

#### Get a url for a file

```javascript
var url = storage.getUrl('gs://some-bucket/images/file.jpg')

// expiration time in seconds
var options = {
    expiration: 100,
    download: true
};

var signedUrl = storage.getSignedUrl('gs://some-bucket/images/file.jpg', options)
```
