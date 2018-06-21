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

      compiledTemplate._originalRender = compiledTemplate.render;

      compiledTemplate.render = function () {
        var parsedError;

        try {
          return compiledTemplate._originalRender.apply(compiledTemplate, arguments);
        } catch (error) {
          parsedError = /^.*\[Line\s(\d+),\sColumn\s(\d+)\]\s*(.*)$/.exec(error.message);

          if (!!parsedError) {
            throw {
              filename: path.basename(file.path),
              filepath: file.path,
              line: parseInt(_.get(parsedError, '[1]', '0'), 10),
              char: parseInt(_.get(parsedError, '[2]', '0'), 10),
              message: _.get(parsedError, '[3]', error.message.replace('\n', ''))
            };
          } else {
            throw error;
          }
        }
      };

      gulp[options.storeAs][path.basename(file.path)] = compiledTemplate;

      callback();
    });
  };
};
