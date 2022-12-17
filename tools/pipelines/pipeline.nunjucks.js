var _ = require('lodash'),
    fs = require('fs'),
    path = require('path'),
    gutil = require('gulp-util'),
    nunjucks = require('nunjucks'),
    through = require('through2'),
    cheerio = require('cheerio'),
    ImgixClient = require('@imgix/js-core');

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
          //load INJECTED and html-parsed template and select only all <img/> tags (for now), intiate imgix core client
          var $ = cheerio.load(compiledTemplate._originalRender.apply(compiledTemplate, arguments)),
          imageTags = $('img'),
          client = new ImgixClient({ domain: 'ix-www.imgix.net' });

          //interate through each <img /> element
          imageTags.each((index, imgTag) => {
            var attributes = imgTag.attribs,
            path = attributes['ix-path'],
            imgURL,
            params
            
            //if element has `ix-path` attribute, we can set host domain to `ix-host`, 
            // otherwise the default is `ix-www.imgix.net` anyway
            //set params to parsed `ix-params` or pass an empty object
            if (path) {
              if (attributes['ix-host']) client.settings.domain = attributes['ix-host'];

              params = attributes['ix-params'] ? JSON.parse(attributes['ix-params']) : {};
            }

            //if element is using `ix-src` or `src` attribute, we can parse out that URL 
            // and set the path and params from the URL
            else {
              imgURL = attributes['ix-src'] ? new URL(attributes['ix-src']) : new URL(attributes['src']);

              if (imgURL.hostname !== client.settings.domain) client.settings.domain = imgURL.hostname;

              path = imgURL.pathname;

              params = Object.fromEntries(imgURL.searchParams);
            }

            //set `src` and `srcset` attributes of <img/> tag.
            attributes['src'] = client.buildURL(path, params);

            attributes['srcset'] = client.buildSrcSet(path, params);
          })
          //return mutated html
          return $.html();
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
