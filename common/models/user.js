// "use strict";

const config = require('../../server/config.json');
const path = require('path');
const loopback = require('loopback');

const debug = require('debug')('loopback:dobots');

const util = require('../../server/emails/util');

module.exports = function(model) {

  ///// put the acls by default, since the base model user
  ///// already has the ACLs set anyway
  // let app = require('../../server/server');
  // if (app.get('acl_enabled')) {

  //***************************
  // GENERAL:
  //   - nothing
  //   - download user profile pic
  //***************************
  model.settings.acls.push({
    "accessType": "*",
    "principalType": "ROLE",
    "principalId": "$everyone",
    "permission": "DENY"
  });
  model.settings.acls.push({
    "principalType": "ROLE",
    "principalId": "$everyone",
    "permission": "ALLOW",
    "property": "resendVerification"
  });
  model.settings.acls.push({
    "principalType": "ROLE",
    "principalId": "$everyone",
    "permission": "ALLOW",
    "property": "resendVerification"
  });
  //***************************
  // AUTHENTICATED:
  //   - create new user
  //   - request own user info
  //***************************
  model.settings.acls.push({
    "principalType": "ROLE",
    "principalId": "$authenticated",
    "permission": "ALLOW",
    "property": "create"
  });
  model.settings.acls.push({
    "principalType": "ROLE",
    "principalId": "$authenticated",
    "permission": "ALLOW",
    "property": "me"
  });
  //***************************
  // OWNER:
  //   - anything on the the users own item
  //***************************
  model.settings.acls.push({
    "accessType": "*",
    "principalType": "ROLE",
    "principalId": "$owner",
    "permission": "ALLOW"
  });
  // }

  /************************************
   **** Disable Remote Methods
   ************************************/

  model.disableRemoteMethodByName('find');
  model.disableRemoteMethodByName('findOne');
  model.disableRemoteMethodByName('updateAll');
  model.disableRemoteMethodByName('upsert');
  model.disableRemoteMethodByName('exists');
  model.disableRemoteMethodByName('createChangeStream');

  model.disableRemoteMethodByName('__get__accessTokens');
  model.disableRemoteMethodByName('__create__accessTokens');
  model.disableRemoteMethodByName('__delete__accessTokens');
  model.disableRemoteMethodByName('__count__accessTokens');
  model.disableRemoteMethodByName('__findById__accessTokens');
  model.disableRemoteMethodByName('__destroyById__accessTokens');
  model.disableRemoteMethodByName('__updateById__accessTokens');

  model.disableRemoteMethodByName('__create__currentLocation');
  model.disableRemoteMethodByName('__delete__currentLocation');
  model.disableRemoteMethodByName('__updateById__currentLocation');
  model.disableRemoteMethodByName('__deleteById__currentLocation');
  model.disableRemoteMethodByName('__destroyById__currentLocation');
  model.disableRemoteMethodByName('__count__currentLocation');
  model.disableRemoteMethodByName('__link__currentLocation');
  model.disableRemoteMethodByName('__unlink__currentLocation');
  model.disableRemoteMethodByName('__findById__currentLocation');

  model.disableRemoteMethodByName('__delete__spheres');
  model.disableRemoteMethodByName('__create__spheres');
  model.disableRemoteMethodByName('__updateById__spheres');
  model.disableRemoteMethodByName('__destroyById__spheres');
  model.disableRemoteMethodByName('__link__spheres');
  model.disableRemoteMethodByName('__count__spheres');
  model.disableRemoteMethodByName('__get__spheres');

  model.disableRemoteMethodByName('__delete__devices');

  /************************************
   **** Model Validation
   ************************************/

  // reserved user roles for special liberties
  // model.validatesExclusionOf('role', {in: ['superuser', 'admin', 'lib-user'], allowNull: true});

  // const regex = /^(?=.*\d).{8,}$/; // Password must be at least 8 characters long and include at least one numeric digit.
  // const regex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?!.*\s).{8,}$/; // Password must be at least 8 characters, and must include at least one upper case letter, one lower case letter, one numeric digit, and no spaces.
  // const regex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?!.*\s)(?=.*[!@#$%^&amp;*()_+}{&quot;:;'?/&gt;.&lt;,]).{8,}$/; // Password must be at least 8 characters, and must include at least one upper case letter, one lower case letter, one numeric digit, no spaces, and one special character
  // model.validatesFormatOf('password', {with: regex, message: 'Invalid format. Password needs to be at least 8 characters long and include at least 1 digit'})

  /************************************
   **** Verification checks
   ************************************/

  // check that the owner of a sphere can't unlink himself from the sphere, otherwise there will
  // be access problems to the sphere. And a sphere should never be without an owner.
  model.beforeRemote('*.__unlink__spheres', function(context, user, next) {

    const Sphere = loopback.findModel('Sphere');
    Sphere.findById(context.args.fk, function(err, sphere) {
      if (err) return next(err);
      if (!sphere) return next();

      if (String(sphere.ownerId) === String(context.instance.id)) {
        let error = new Error("can't exit from sphere where user with id is the owner");
        return next(error);
      } else {
        next();
      }
    })
  });

  // check that a user is not deleted as long as he is owner of a sphere
  model.observe('before delete', function(context, next) {
    const Sphere = loopback.findModel('Sphere');
    Sphere.find({where:{ownerId: context.where.id}}, function(err, spheres) {
      if (err) return next(err);
      if (spheres.length > 0) {
        let error = new Error("Can't delete user as long as he is owner of a sphere");
        next(error);
      } else {
        next();
      }
    });
  });

  model.afterRemoteError('confirm', function(ctx, next) {
    // debug('confirmation failed!', ctx.error);
    // debug(ctx.res)

    // ctx.req.args.uid

    ctx.res.render('response', {
      title: 'Verification failed',
      content: ctx.error,
      redirectTo: '/resend-verification',
      redirectToLinkText: 'Resend verification'
    });
    // next(null);
    // next();
  });

  /************************************
   **** Cascade
   ************************************/

  // if the sphere is deleted, delete also all files stored for this sphere
  model.observe('after delete', function(context, next) {
    model.deleteAllFiles(context.where.id, function() {
      next();
    });
  });

  /************************************
   **** Custom functions
   ************************************/

  model.sendVerification = function(user, tokenGenerator, callback) {

    let options = util.getVerificationEmailOptions(user);
    options.generateVerificationToken = tokenGenerator;
    // let options = {
    // 	type: 'email',
    // 	to: user.email,
    // 	from: 'noreply@crownstone.rocks',
    // 	subject: 'Thanks for registering.',
    // 	template: path.resolve(__dirname, '../../server/views/verify.ejs'),
    // 	redirect: '/verified',
    // 	user: user,
    // 	protocol: 'http',
    // 	port: 80,
    // 	generateVerificationToken: func
    // };

    // console.log("options: " + JSON.stringify(options));

    debug("sending verification");
    user.verify(options, callback);
  };

  model.onCreate = function(context, user, callback) {

    if (model.settings.emailVerificationRequired) {
      model.sendVerification(user, null, function(err, response) {
        if (err) return callback(err);

        callback();
      })
    } else {
      callback();
    }
  };

  //send verification email after registration
  model.afterRemote('create', function(context, user, next) {
    console.log('> user.afterRemote triggered');
    model.onCreate(context, user, next);
    // next();
  });

  //send password reset link when requested
  model.on('resetPasswordRequest', function(info) {
    let url = 'https://' + (process.env.BASE_URL || (config.host + ':' + config.port)) + '/reset-password';
    let token = info.accessToken.id;
    let email = info.email;
    util.sendResetPasswordRequest(url, token, email);
  });

  model.resendVerification = function(email, callback) {
    model.findOne({where: {email: email}}, function(err, user) {
      if (err) return callback(err);
      if (model.checkForNullError(user, callback, "email: " + email)) return;

      if (!user.emailVerified) {
        if (user.verificationToken) {
          model.sendVerification(user,
            function(user, tokenProvider) {
              tokenProvider(null, user.verificationToken);
            },
            function(err, response) {
              callback(err);
            }
          );
        } else {
          model.sendVerification(user, null, function(err, response) {
            callback(err);
          });
        }
      } else {
        let err = new Error("user already verified");
        err.statusCode = 400;
        err.code = 'ALREADY_VERIFIED';
        callback(err);
      }
    })
  };

  model.remoteMethod(
    'resendVerification',
    {
      http: {path: '/resendVerification', verb: 'post'},
      accepts: {arg: 'email', type: 'string', required: true, 'http': {source: 'query'}},
      description: "Resend verification email"
    }
  );

  model.me = function(options, callback) {
    // debug("me");
    let errorMessage = "Could not find user.";
    if (options && options.accessToken && options.accessToken.userId) {
      model.findById(options.accessToken.userId)
        .then((user) => {
          if (user === null) {
            throw errorMessage;
          }
          else {
            callback(null, user);
          }
        })
        .catch((err) => {
          callback(err);
        });
    }
    else {
      callback(errorMessage);
    }
  };

  model.remoteMethod(
    'me',
    {
      http: {path: '/me', verb: 'get'},
      accepts: [
        {arg: "options", type: "object", http: "optionsFromRequest"},
      ],
      returns: {arg: 'data', type: 'user', root: true},
      description: "Return instance of authenticated User"
    }
  );


  model.spheres = function(id, callback) {
    model.findById(id, function(err, instance) {
      if (err) return callback(err);
      if (model.checkForNullError(instance, callback, "id: " + id)) return;

      instance.spheres(function(err, spheres) {
        if (err) return callback(err);

        // debug("spheres:", spheres);

        const SphereAccess = loopback.getModel('SphereAccess');
        SphereAccess.find(
          {where: {and: [{userId: id}, {invitePending: {neq: true}}]}, field: "sphereId"},
          function(err, res) {
            if (err) return callback(err);

            let filteredSpheres = [];
            for (let i = 0; i < spheres.length; ++i) {
              let sphere = spheres[i];
              for (let j = 0; j < res.length; ++j) {
                let access = res[j];

                // String cast is required because loopback can use an internal ObjectID object for ids.
                if (String(sphere.id) === String(access.sphereId)) {
                  filteredSpheres.push(sphere);
                  break;
                }
              }
            }
            // debug("found spheres: ", filteredSpheres);
            callback(null, filteredSpheres);
          }
        );
      });
    });
  };

  model.remoteMethod(
    'spheres',
    {
      http: {path: '/:id/spheres', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }}
      ],
      returns: {arg: 'data', type: ['Sphere'], root: true},
      description: "Queries spheres of user"
    }
  );

  model.countSpheres = function(id, callback) {
    model.spheres(id, function(err, res) {
      if (err) callback(err);
      callback(null, res.length);
    })
  };

  model.remoteMethod(
    'countSpheres',
    {
      http: {path: '/:id/spheres/count', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }}
      ],
      returns: {arg: 'count', type: 'number'},
      description: "Count spheres of user"
    }
  );

  model.notifyDevices = function(message, id, callback) {
    // debug("notifyDevices:", message);

    const Notification = loopback.getModel('Notification');
    let notification = new Notification({
      expirationInterval: 3600, // Expires 1 hour from now.
      alert: message,
      message: message,
      messageFrom: 'loopback'
    });

    const Push = loopback.getModel('Push');
    Push.notifyByQuery({userId: id}, notification, callback);

  };

  model.remoteMethod(
    'notifyDevices',
    {
      http: {path: '/:id/notifyDevices', verb: 'post'},
      accepts: [
        {arg: 'message', type: 'string', 'http': {source: 'query'}},
        {arg: 'id', type: 'any', required: true, 'http': {source: 'path'}}
      ],
      description: "Push notification to all Devices of user"
    }
  );

  /************************************
   **** Container Methods
   ************************************/

  model.listFiles = function(id, options, callback) {
    const Container = loopback.getModel('UserContainer');
    Container._getFiles(id, options, callback);
  };

  model.remoteMethod(
    'listFiles',
    {
      http: {path: '/:id/files', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: "options", type: "object", http: "optionsFromRequest"},
      ],
      returns: {arg: 'files', type: 'array', root: true},
      description: "Queries files of User"
    }
  );

  model.countFiles = function(id, options, callback) {
    const Container = loopback.getModel('UserContainer');
    Container._getFiles(id, options, function(err, res) {
      if (err) return callback(err);

      callback(null, res.length);
    });
  };

  model.remoteMethod(
    'countFiles',
    {
      http: {path: '/:id/files/count', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: "options", type: "object", http: "optionsFromRequest"},
      ],
      returns: {arg: 'count', type: 'number'},
      description: "Count files of User"
    }
  );


  model.deleteFile = function(id, fk, options, callback) {
    const Container = loopback.getModel('UserContainer');
    Container._deleteFile(id, fk, options, callback);
  };

  model.remoteMethod(
    'deleteFile',
    {
      http: {path: '/:id/files/:fk', verb: 'delete'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'fk', type: 'any', required: true, http: { source : 'path' }},
        {arg: "options", type: "object", http: "optionsFromRequest"},
      ],
      description: "Delete a file by id"
    }
  );

  model.downloadFile = function(id, fk, res, options, callback) {
    const Container = loopback.getModel('UserContainer');
    Container._download(id, fk, res, options, callback);
  };

  model.remoteMethod(
    'downloadFile',
    {
      http: {path: '/:id/files/:fk', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'fk', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'res', type: 'object', 'http': { source: 'res' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      description: "Download a file by id"
    }
  );

  model.uploadFile = function(id, req, options, callback) {
    const Container = loopback.getModel('UserContainer');
    Container._upload(id, req, options, callback);
  };

  model.remoteMethod(
    'uploadFile',
    {
      http: {path: '/:id/files', verb: 'post'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'req', type: 'object', http: { source: 'req' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      returns: {arg: 'file', type: 'object', root: true},
      description: "Upload a file to User"
    }
  );

  model.uploadProfilePic = function(id, req, options, callback) {
    // debug("uploadProfilePic");

    let upload = function(user, req) {

      // upload the file
      model.uploadFile(user.id, req, function(err, file) {
        if (err) return callback(err);

        // and set the id as profilePicId
        user.profilePicId = file._id;
        user.save();

        callback(null, file);
      });
    };

    // get the user instance
    model.findById(id, function(err, user) {
      if (err) return callback(err);
      if (model.checkForNullError(user, callback, "id: " + id)) return;

      // if there is already a profile picture uploaded, delete the old one first
      if (user.profilePicId) {
        model.deleteFile(user.id, user.profilePicId, function(err, file) {
          if (err) return callback(err);
          upload(user, req);
        });
      }
      else {
        upload(user, req);
      }
    });
  };

  model.remoteMethod(
    'uploadProfilePic',
    {
      http: {path: '/:id/profilePic', verb: 'post'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'req', type: 'object', http: { source: 'req' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      returns: {arg: 'file', type: 'object', root: true},
      description: "Upload profile pic to User"
    }
  );

  model.downloadProfilePicById = function(id, res, options, callback) {
    // debug("downloadProfilePicById");

    model.findById(id, function(err, user) {
      if (err) return callback(err);
      if (model.checkForNullError(user, callback, "id: " + id)) return;

      model.downloadFile(id, user.profilePicId, res, options, callback);
    });
  };

  model.remoteMethod(
    'downloadProfilePicById',
    {
      http: {path: '/:id/profilePic', verb: 'get'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'res', type: 'object', 'http': { source: 'res' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      description: "Download profile pic of User"
    }
  );

  model.deleteProfilePicById = function(id, res, options, callback) {
    // debug("downloadProfilePicById");

    model.findById(id, function(err, user) {
      if (err) return callback(err);
      if (model.checkForNullError(user, callback, "id: " + id)) return;

      model.deleteFile(id, user.profilePicId, res, callback);
    });
  };

  model.remoteMethod(
    'deleteProfilePicById',
    {
      http: {path: '/:id/profilePic', verb: 'delete'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      description: "Delete profile pic of User"
    }
  );

  /************************************
   **** Keys Methods
   ************************************/

  model.getEncryptionKeys = function(id, callback) {
    const SphereAccess = loopback.getModel('SphereAccess');
    SphereAccess.find({where: {userId: id}, include: "sphere"}, function(err, objects) {
      let keys = Array.from(objects, function(access) {
        let sphere = { sphereId: access.sphereId, keys: {}};
        let sphereData = access.sphere();
        console.log('sphereData',sphere, access);
        switch (access.role) {
          case "admin":
            sphere.keys.admin  = sphereData.adminEncryptionKey;
          case "member":
            sphere.keys.member = sphereData.memberEncryptionKey;
          case "guest":
            sphere.keys.guest  = sphereData.guestEncryptionKey;
        }
        return sphere
      });

      console.log(keys)
      callback(null, keys);
    });
  };

  model.remoteMethod(
    'getEncryptionKeys',
    {
      http: {path: '/:id/keys', verb: 'get'},
      accepts: {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
      returns: {arg: 'data', type: ['object'], root: true},
      description: "Returns encryption keys per Sphere of User"
    }
  );

  /************************************
   **** Delete ALL functions
   ************************************/

  model.deleteAllDevices = function(id, callback) {
    debug("deleteAllDevices");
    model.findById(id, {include: "devices"}, function(err, user) {
      if (err) return callback(err);
      if (model.checkForNullError(user, callback, "id: " + id)) return;

      user.devices.destroyAll(function(err) {
        callback(err);
      });
    })
  };

  model.remoteMethod(
    'deleteAllDevices',
    {
      http: {path: '/:id/deleteAllDevices', verb: 'delete'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
      ],
      description: "Delete all devices of User"
    }
  );

  model.deleteAllFiles = function(id, options, callback) {
    debug("deleteAllFiles");
    const Container = loopback.getModel('UserContainer');
    Container._deleteContainer(id, options, callback);
  };

  model.remoteMethod(
    'deleteAllFiles',
    {
      http: {path: '/:id/deleteAllFiles', verb: 'delete'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
        {arg: 'options', type: 'object', http: 'optionsFromRequest'},
      ],
      description: "Delete all files of User"
    }
  );

  model.deleteAllSpheres = function(id, callback) {
    debug("deleteAllSpheres");

    // get a reference to the sphere model which we need to query for stones.
    const sphereModel = loopback.getModel("Sphere");
    let completed = false;
    // get all spheres from the user
    model.findById(id, {include: "spheres"})
      .then((user) => {
        let userSpheres = user.spheres();
        if (model.checkForNullError(user, callback, "id: " + id)) {
          return;
        }

        if (userSpheres.length === 0) {
          completed = true;
          return callback();
        }

        let promisesPerSphere = [];
        let spheresWithStones = 0;
        let sphereObjectWithStones = {}; // used for error message.
        for (let i = 0; i < userSpheres.length; i++) {
          let sphere = user.spheres()[i];
          promisesPerSphere.push(sphereModel.findById(sphere.id, {include: "ownedStones"})
            .then((sphereData) => {
              let ownedStones = sphereData.ownedStones();
              if (ownedStones.length > 0) {
                spheresWithStones += 1;
                sphereObjectWithStones = sphere;
              }
            })
          );
        }
        return Promise.all(promisesPerSphere).then(() => {
          if (spheresWithStones > 0) {
            throw new Error('Stones detected in sphere ' + sphereObjectWithStones.name + ' (' + sphereObjectWithStones.id + '). Can not delete all Spheres until they all have their stones removed.')
          }
          return userSpheres;
        })
      })
      .then((userSpheres) => {
        if (!completed) {
          let removalPromises = [];
          userSpheres.forEach((sphere) => {
            removalPromises.push(sphere.destroy());
          });
          return Promise.all(removalPromises)
        }
      })
      .then(() => {
        if (!completed) {
          return callback();
        }
      })
      .catch((err) => {
        if (!completed) {
          return callback(err);
        }
      });


    // user.spheres.destroyAll(function(err) {
    // 	callback(err);
    // });
  };

  model.remoteMethod(
    'deleteAllSpheres',
    {
      http: {path: '/:id/deleteAllSpheres', verb: 'delete'},
      accepts: [
        {arg: 'id', type: 'any', required: true, http: { source : 'path' }},
      ],
      description: "Delete all spheres of User"
    }
  );

};
