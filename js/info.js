$(document).ready(function() {
	$('body').on('click', '#close', function(){
		$('.info').remove();
	})
	$(document).on('click', function(event){
		if (!$(event.target).closest('.info, foreignObject' ).length && $('.info').length) {
			$('.info').remove();
		}
	});
})
