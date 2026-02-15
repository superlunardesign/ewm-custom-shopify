 if($(window).width() > 767)
    {
      jQuery(function($) {
       $('.dt-sc-hotspot-item').each(function () {
        var pop = $(this).find('.dt-sc-hotspot-popup');
        pop.click(function(e) {
          e.stopPropagation();
        });

        $(this).find('a.dt-sc-hotspot-marker').click(function(e) {
          e.preventDefault();
          e.stopPropagation();
          $('.dt-sc-hotspot-item').removeClass('open');
          $(this).closest('.dt-sc-hotspot-item').addClass('open');
          $(this).next('.dt-sc-hotspot-popup').toggleClass('dt-sc-popup-open');
         // $(this).parent().siblings().children('.dt-sc-hotspot-popup').toggleClass('dt-sc-popup-open');
        });

        $(document).click(function() {
          pop.removeClass('dt-sc-popup-open');
          $('.dt-sc-hotspot-item').removeClass('open');
        });
      });
  });
    }

    if($(window).width() < 768) {
      $('.dt-sc-hotspot-popup').addClass('mfp-hide');
      $('.dt-sc-hotspot-marker').each(function() {
        $(this).magnificPopup({
          type: 'inline'
        });
      });
    }