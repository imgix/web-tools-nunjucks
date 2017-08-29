module.exports = function setUpNunjucksPipeline(gulp) {
  // Add the default pipelines to the cache
  gulp.pipelineCache.put('nunjucks', require('./pipelines/pipeline.nunjucks.js'));
}
