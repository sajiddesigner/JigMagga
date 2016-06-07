!function(){
	function sassTransform(sassSteal, sassText){
        // here you can add some logic to transform the sass output
        return sassText;
	}

    // steal export
    if (typeof steal !== 'undefined') {
        steal(function () {
            return sassTransform
        });
    }

    //node export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = sassTransform
    }
}();

