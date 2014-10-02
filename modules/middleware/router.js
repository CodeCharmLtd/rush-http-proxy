var DispatchTable = require('../../DispatchTable');

var defaultModule = 'proxy';
var entryRegexp = /^\s*(?:(\w+)\s*(?:->|: )\s*)?(.*)/;

function handlerForMiddlewareList(middleware) {
  return {
    middleware: function(req, res, next) {
      var i = 0;
      var length = middleware.length;
      function runMiddleware() {
        if (i < length) {
          middleware[i].middleware(req, res, function(err) {
            if (err) {
              return next(err);
            }
            i += 1;
            // delete matches so that each dispatch table
            // on separate routes fills their own
            // TODO: this is probably not correct ...
            delete req.hostMatch;
            delete req.pathMatch;
            runMiddleware(req, res, next);
          }, middleware[i].dispatchTarget);
        } else {
          next();
        }
      }
      runMiddleware();
    }
  };
}

module.exports = function Router(di, portConfig, portNumber) {

  function passEntryToModule(moduleName, entry) {
    var instance = di.resolve(moduleName);
    if(instance.entryParser) {
      // allow modules to cache arbitrary data per entry
      entry = instance.entryParser(entry);
    }
    return {
      middleware: instance.requestHandler,
      dispatchTarget: entry
    };
  }

  function parseSingleEntry(entry) {
    var m = entry.toString().match(entryRegexp);
    var moduleName = m[1] || defaultModule;
    var entryKey = m[2];

    return passEntryToModule(moduleName, entryKey);
  }


  return {
    entryParser: function(routerEntries) {

      if (!(routerEntries instanceof Array)) {
        routerEntries = [routerEntries];
      }
      var middlewareList = routerEntries.map(function(routerEntry) {
        if(typeof routerEntry !== 'object' && typeof routerEntry !== 'undefined') {
          return parseSingleEntry(routerEntry);
        }
        var dispatchTable = new DispatchTable(portNumber, {
          config: routerEntry,
          entryParser: function(entry) {
            if (typeof entry === 'object') {
              if(entry instanceof Array) {
                return handlerForMiddlewareList(entry.map(parseSingleEntry));
              }
              else {
                return passEntryToModule('router', entry);
              }
            }
            return parseSingleEntry(entry);
          },
          requestHandler: function(req, res, next, target) {

            target.middleware(req, res, next, target.dispatchTarget);
          }
        });
        return {
          middleware: DispatchTable.prototype.dispatchRequest.bind(dispatchTable)
        }
      });

      return handlerForMiddlewareList(middlewareList)
    },
    requestHandler: function(req, res, next, target) {
      target.middleware(req, res, next, target.dispatchTarget);
    }
  };
}