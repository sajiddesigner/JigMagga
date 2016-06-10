var config = null;


if (typeof steal !== "undefined") {
    steal(function() {
      var viewHelperObject = {
        /**
        * Replace a relative link with is current local path and return it absolute
        * @param link -> the relativ link
        * @param targetUrl -> will be replace the placeolder in config.pages
        * @param locale -> the current local that is used
        * @returns {*}
        */
        pageLink: function (link, targetUrl, locale) {
          var resultUrl,
          key,
          linkArr = link.split("#!"),
          route = linkArr[1] ? "#!" + linkArr[1] : "";

          var localConfig = config || this.config;
          link = linkArr[0];
          locale = locale || localConfig.locale;

          if (!localConfig.pages[link]) {
            for (key in localConfig.pages) {
              if (key.indexOf("/" + link) !== -1) {
                link = key;
              }
            }
          }

          if (typeof steal != "undefined" && steal.config().env === 'development') {
            resultUrl = location.pathname.replace(/(.*\.[a-z]{2,3}\/).*/, "$1" + link + "/" + link.replace(/^.*\//, "") + ".html" + route);
          } else if (localConfig.pages[link]) {
            if (localConfig.pages[link][locale]) {
              resultUrl = localConfig.pages[link][locale] + route;
            } else {
              resultUrl = localConfig.pages[link][Object.keys(localConfig.pages[link])[0]] + route;
            }
            if (targetUrl) {
              resultUrl = resultUrl.replace("{url}", targetUrl);
            }
          }
          return resultUrl;
        },
        staticLink: function (link, locale) {
          return viewHelperObject.pageLink.call(this, link, undefined, locale);
        }
      };
      
        config = steal.config()[steal.config().namespace];
        return viewHelperObject;
    });

} else if (typeof module !== "undefined" && typeof module.require === 'function') {
    var _ = require('lodash');
    module.exports = function (res) {
        //config = res;
        var viewHelper = {};
        Object.keys(viewHelperObject).forEach(function (key) {
           if (typeof viewHelperObject[key] === 'function') {
               viewHelper[key] = viewHelperObject[key].bind({config: _.clone(res)});
           }
        });

        return viewHelper;
    };
}
