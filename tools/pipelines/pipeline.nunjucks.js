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

        //transforms html <img> and <picture> tags with @imgix/js-core
        try {
          var parsedHTML = compiledTemplate._originalRender.apply(compiledTemplate, arguments);

          if (/xml|recent_posts|news/.test(file.path)) {
            return parsedHTML;
          }

          var $ = cheerio.load(parsedHTML),
              imageTags = $('img, picture > source, picture > img'),
              client = new ImgixClient({ domain: 'ix-www.imgix.net' });

          imageTags.each((index, imgTag) => {
            var attributes = imgTag.attribs,
                path = attributes['ix-path'],
                params = attributes['ix-params'] ? JSON.parse(attributes['ix-params']) : {},
                imgURL,
                maxWidth

            if (path) {
              client.settings.domain = attributes['ix-host'] ?? 'ix-www.imgix.net';
            } else {
              imgURL = attributes['ix-src'] ? new URL(attributes['ix-src']) : new URL(attributes['src']);
              client.settings.domain = imgURL.hostname;
              path = imgURL.pathname;
              params = Object.assign(Object.fromEntries(imgURL.searchParams), params);
            }

            params.auto = params.auto ? Array.from(new Set(params.auto.split(',')).add('compress').add('format')).join(',') : 'compress,format';

            if (imgTag.name === 'img') attributes['src'] = client.buildURL(path, params, { disablePathEncoding: true });

            if (params.w && params.h && params.fit !== 'facearea') {
              params.ar = params.w + ':' + params.h;
              params.fit = params.fit ?? 'crop';

              delete params.h;
            }

            maxWidth = Math.max(Number(params.w ?? 1800), 1800);

            if (params.fit !== 'facearea') {
              delete params.w;
            }

            attributes['srcset'] = client.buildSrcSet(path, params, { minWidth: 100, maxWidth: maxWidth, disablePathEncoding: true });
            attributes['sizes'] = (attributes['sizes'] ?? attributes['ix-sizes']) ?? '100vw';
          })

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
