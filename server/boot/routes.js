var sha1 = require('sha1');

module.exports = function(app) {
  var User = app.models.user;
  var Sphere = app.models.Sphere;
  var SphereAccess = app.models.SphereAccess;

  function hashPassword(password) {
    return sha1(password);
  }

  //login page
  app.get('/', function(req, res) {
    res.render('main', {
      firstName: "",
      lastName: "",
      email: "",
      password: ""
    });
  });

  //verified
  app.get('/verified', function(req, res) {
    res.render('verified');
  });

  //log a user in
  app.post('/login', function(req, res) {
    User.login({
      email: req.body.email,
      password: hashPassword(req.body.password)
    }, 'user', function(err, token) {
      if (err) {
        if (err.code === 'LOGIN_FAILED_EMAIL_NOT_VERIFIED') {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/resend-verification',
            redirectToLinkText: 'Resend verification'
          });
        } else {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/',
            redirectToLinkText: 'Try again'
          });
        }
        return;
      }

      res.render('home', {
        email: req.body.email,
        accessToken: token.id
      });
    });
  });

  //log a user out
  app.get('/logout', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    User.logout(req.accessToken.id, function(err) {
      if (err) return next(err);
      res.redirect('/');
    });
  });

  app.get('/resend-verification', function(req, res) {
    res.render('resend-verification', {
      email: ""
    });
  });

  app.post('/request-verification', function(req, res, next) {
    User.resendVerification(req.body.email, function(err, user) {
      if (err) return next(err);

      res.render('response', {
        title: 'Verification email successfully resent',
        content: 'Please check your email and click on the verification link ' +
        'before logging in.',
        redirectTo: '/',
        redirectToLinkText: 'Log in'
      });
    });
});

  //send an email with instructions to reset an existing user's password
  app.post('/request-password-reset', function(req, res, next) {
    User.resetPassword({
      email: req.body.email
    }, function(err) {
      if (err) return res.status(401).send(err);

      res.render('response', {
        title: 'Password reset requested',
        content: 'Check your email for further instructions',
        redirectTo: '/',
        redirectToLinkText: 'Log in'
      });
    });
  });

  //show password reset form
  app.get('/reset-password', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);
    res.render('password-reset', {
      accessToken: req.accessToken.id
    });
  });

  //reset the user's pasword
  app.post('/reset-password', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);

    //verify passwords match
    if (!req.body.password ||
        !req.body.confirmation ||
        req.body.password !== req.body.confirmation) {
      return res.sendStatus(400, new Error('Passwords do not match'));
    }

    User.findById(req.accessToken.userId, function(err, user) {
      if (err) return res.sendStatus(404);
      user.updateAttribute('password', hashPassword(req.body.password), function(err, user) {
      // user.updateAttribute('password', req.body.password, function(err, user) {
      if (err) return res.sendStatus(404);
        console.log('> password reset processed successfully');
        res.render('response', {
          title: 'Password reset success',
          content: 'Your password has been reset successfully',
          redirectTo: '/',
          redirectToLinkText: 'Log in'
        });
      });
    });
  });

  app.get('/decline-invite-new', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);

    User.findById(req.accessToken.userId, function(err, user) {
      if (user.emailVerified) {
        console.log('err, user already verified');
        // return res.sendStatus(400, new Error("User already verified"));

        res.render('response', {
          title: 'Bad Request',
          content: 'User is already verified',
          redirectTo: '/',
          redirectToLinkText: 'Log in'
        });
        // console.log('remove again from sphere');
        // SphereAccess.destroyAll({sphereId: sphereId, userId: req.accessToken.userId}, function(err) {
        //   if (err) return res.sendStatus(400, "Failed to remove again from sphere");
        //   next();
        // })
      } else {
        SphereAccess.destroyAll({sphereId: req.sphereId, userId: user.id}, function(err) {
          if (err) console.log("failed to remove user from sphere");
          user.destroy(function(err, info) {
            if (err) console.log("failed to delete user");

            res.render('response', {
              title: 'Invite declined',
              content: 'You have declined the invitation',
              redirectTo: '/',
              redirectToLinkText: 'Log in'
            });
          });
        })
      }
    });
  });

  app.get('/accept-invite', function(req, res, next) {
    res.render('login', {
      email: "",
      password: "",
      loginPostUrl: "/accept-invite",
      sphereId: req.sphereId
    });
  });

  //log a user in
  app.post('/accept-invite', function(req, res) {
    User.login({
      email: req.body.email,
      password: hashPassword(req.body.password)
    }, 'user', function(err, token) {
      if (err) {
        if (err.code === 'LOGIN_FAILED_EMAIL_NOT_VERIFIED') {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/resend-verification',
            redirectToLinkText: 'Resend verification'
          });
        } else {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/',
            redirectToLinkText: 'Try again'
          });
        }
        return;
      }

      // User.findById(token.userId, function(err, user) {
      //   user.invitePending = null;
      //   user.save();
      // });
      SphereAccess.updateAll(
        {sphereId: req.body.sphereId, userId: token.userId, invitePending: true},
        {invitePending: false},
        function(err, info) {
          if (err) console.log("failed to update sphere access");

          if (info.count == 0) {
            res.render('response', {
              title: 'Bad Request',
              content: 'No pending invitation found',
              redirectTo: '/',
              redirectToLinkText: 'Log in'
            });
          } else {
            res.render('response', {
              title: 'Invite accepted',
              content: 'You have accepted the invitation',
              redirectTo: '/',
              redirectToLinkText: 'Log in'
            });
          }
      });

    });
  });


  app.get('/decline-invite', function(req, res, next) {
    res.render('login', {
      email: "",
      password: "",
      loginPostUrl: "/decline-invite",
      sphereId: req.sphereId
    });
  });

  //log a user in
  app.post('/decline-invite', function(req, res) {
    User.login({
      email: req.body.email,
      password: hashPassword(req.body.password)
    }, 'user', function(err, token) {
      if (err) {
        if (err.code === 'LOGIN_FAILED_EMAIL_NOT_VERIFIED') {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/resend-verification',
            redirectToLinkText: 'Resend verification'
          });
        } else {
          res.render('response', {
            title: 'Login failed',
            content: err,
            redirectTo: '/',
            redirectToLinkText: 'Try again'
          });
        }
        return;
      }

      // User.findById(token.userId, function(err, user) {
      //   user.invitePending = null;
      //   user.save();
      // });

      SphereAccess.destroyAll(
        {sphereId: req.body.sphereId, userId: token.userId, invitePending: true},
        function(err, info) {
          if (err) console.log("failed to remove user from sphere");

          if (info.count == 0) {
            res.render('response', {
              title: 'Bad Request',
              content: 'No pending invitation found',
              redirectTo: '/',
              redirectToLinkText: 'Log in'
            });
          } else {
            res.render('response', {
              title: 'Invite declined',
              content: 'You have declined the invitation',
              redirectTo: '/',
              redirectToLinkText: 'Log in'
            });
          }
      })
    });
  });

  //show profile setup form
  app.get('/profile-setup', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);

    User.findById(req.accessToken.userId, function(err, user) {
      if (user.emailVerified) {
        console.log("already verified!");
        res.render('response', {
          title: 'Bad Request',
          content: 'User is already successfully set up',
          redirectTo: '/',
          redirectToLinkText: 'Log in'
        });
        // return res.sendStatus(400, new Error("User is already successfully set up"));
      } else {
        res.render('profile-setup', {
          accessToken: req.accessToken.id,
          sphereId: req.sphereId
        });
      }
    });
  });

  //reset the user's pasword
  app.post('/profile-setup', function(req, res, next) {
    if (!req.accessToken) return res.sendStatus(401);

    //verify passwords match
    if (!req.body.firstName || !req.body.lastName) {
      return res.sendStatus(400, new Error('First and last name have to be filled in!'))
    }
    if (!req.body.password ||
        !req.body.confirmation ||
        req.body.password !== req.body.confirmation) {
      return res.sendStatus(400, new Error('Passwords do not match'));
    }

    User.findById(req.accessToken.userId, function(err, user) {
      if (err) return res.sendStatus(404);

      user.emailVerified = true;
      user.firstName = req.body.firstName;
      user.lastName = req.body.lastName;
      user.password = hashPassword(req.body.password);
      user.save(function(err, user) {
        if (err) return res.sendStatus(404);

        SphereAccess.updateAll(
          {sphereId: req.body.sphereId, userId: req.accessToken.userId, invitePending: true},
          {invitePending: false}, function(err, info) {
            if (err) console.log("failed to update sphere access");
        });

        console.log('> signup successful');
        res.render('response', {
          title: 'Signup success',
          content: 'You successfully completed the signup process',
          redirectTo: '/',
          redirectToLinkText: 'Log in'
        });
      });
    });
  });

  // register a new user
  app.post('/register', function(req, res, next) {

    //verify passwords match
    if (!req.body.firstName || !req.body.lastName) {
      return res.render('response', {
        title: 'Bad Request',
        content: 'First and last name have to be filled in!',
        redirectTo: '/',
        redirectToLinkText: 'Try again'
      });
    }
    if (!req.body.password ||
        !req.body.confirmation ||
        req.body.password !== req.body.confirmation) {

      return res.render('response', {
        title: 'Bad Request',
        content: 'Passwords do not match',
        redirectTo: '/',
        redirectToLinkText: 'Try again'
      });

    }

    User.create(
      {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: hashPassword(req.body.password)
      }, function(err, user) {
        if (err) {
          console.log(err)
          return res.render('response', {
            title: 'Bad Request',
            content: "Email already exists",
            redirectTo: '/',
            redirectToLinkText: 'Try again'
          });
        }

        User.onCreate({res: res}, user, next);
      }
    );
  });



};
