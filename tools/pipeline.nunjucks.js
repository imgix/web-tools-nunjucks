var _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    gutil = require('gulp-util'),
    nunjucks = require('nunjucks'),
    through = require('through2');

module.exports = function setupNunjucksPipeline(gulp) {
  return function nunjucksPipeline(options) {
    var nunjucksEnv,
        pageList,
        renderList,
        routeMap;

    options = _.defaultsDeep({}, options, {
      paths: [],
      modifyEnv: function (environment) {
          environment.addGlobal('_', _);
        },
      nunjucksOptions: {},
      storeAs: 'templates'
    });

    if (!gulp[options.storeAs]) {
      gulp[options.storeAs] = {};
    }

    nunjucksEnv = nunjucks.configure(options.paths, options.nunjucksOptions);

    if (_.isFunction(options.modifyEnv)) {
      options.modifyEnv(nunjucksEnv);
    }

    return through.obj(function transform(file, encoding, callback) {
      var compiledTemplate,
          contents = fs.readFileSync(file.path, encoding);

      try {
        compiledTemplate = nunjucks.compile(contents, nunjucksEnv);
      } catch (error) {
        throw new gutil.PluginError('nunjucksPipeline', 'Could not compile template: ' + file.basename);
      }

      gulp[options.storeAs][path.basename(file.path)] = compiledTemplate;

      callback();
    });
  };
};
