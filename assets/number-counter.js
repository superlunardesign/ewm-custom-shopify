function numberCounter() {       
        var dataId = $('.number-counter').attr('data-section-id');  
        $('.inview-' + dataId + '-initialized').bind('inview', function(event, visible) {
            if (visible) {
                //$(this).stop().animate({ opacity: 1 });

                $('.number-counter-value').each(function() {
                    var $this = $(this),
                        max_value = $this.attr('data-value');
                    $({
                        counter_value: $this.text()
                    }).animate({
                        counter_value: max_value
                    }, {
                        step: function step() {
                            $this.text(Math.floor(this.counter_value));
                        },
                        duration: 1500,
                        easing: 'swing',
                        complete: function complete() {
                            $this.text(this.counter_value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")); //For placing comma(,) after particular digit
                        }
                    });
                });
            } else {
                //  $(this).stop().animate({ opacity: 0 });
            }
        });
    }
    $(document).ready(function(){
    numberCounter();  
    });