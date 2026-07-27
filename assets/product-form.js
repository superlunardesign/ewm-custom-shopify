<!-- Product Carousel Section -->
<div class="product-carousel-section">
  <div class="container">
    <h2 class="section-title">{{ section.settings.section_title | default: 'Explore our bestsellers' }}</h2>
    
    <div class="carousel-wrapper">
      <button class="carousel-btn carousel-btn--prev" onclick="scrollCarousel(-1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      
      <div class="product-carousel" id="productCarousel">
        {% assign collection = collections[section.settings.collection] %}
        {% if collection == blank %}
          {% assign collection = collections.all %}
        {% endif %}
        {% for product in collection.products limit: section.settings.products_limit %}
          <div class="product-card">
            <!-- Status Indicators -->
            {% if product.available == false %}
              <div class="status-badge status-badge--out-of-stock">{{ section.settings.out_of_stock_badge_text }}</div>
            {% elsif product.compare_at_price > product.price %}
              <div class="status-badge status-badge--sale">{{ section.settings.sale_badge_text }}</div>
            {% elsif product.tags contains section.settings.new_product_tag %}
              <div class="status-badge status-badge--new">{{ section.settings.new_badge_text }}</div>
            {% elsif product.tags contains section.settings.editors_pick_tag %}
              <div class="status-badge status-badge--editors-pick">{{ section.settings.editors_pick_badge_text }}</div>
            {% endif %}
            
            <!-- Product Image -->
            <div class="product-image">
              {% if product.featured_image %}
                <img src="{{ product.featured_image | img_url: '400x400' }}" 
                     alt="{{ product.featured_image.alt | escape }}" 
                     loading="lazy">
              {% else %}
                <div class="no-image">No image available</div>
              {% endif %}
            </div>
            
            <!-- Product Info -->
            <div class="product-info">
             <div class="product-content">
              <h3 class="product-title">{{ product.title }}</h3>
              
              <!-- Mini Description from metafield -->
              {% if product.metafields.custom.mini_description %}
                <p class="product-mini-description">{{ product.metafields.custom.mini_description }}</p>
              {% endif %}
             </div>
              <!-- Star Rating (if enabled and metafield exists) -->
              {% if section.settings.show_ratings %}
                {% assign rating_namespace = section.settings.rating_metafield_namespace %}
                {% assign rating_key = section.settings.rating_metafield_key %}
                {% assign count_key = section.settings.review_count_metafield_key %}
                
                {% if product.metafields[rating_namespace][rating_key] %}
                  <div class="rating">
                    {% assign rating = product.metafields[rating_namespace][rating_key] | times: 1 %}
                    {% assign review_count = product.metafields[rating_namespace][count_key] | times: 1 %}
                    
                    <div class="stars">
                      {% for i in (1..5) %}
                        {% if i <= rating %}
                          <span class="star star--filled">★</span>
                        {% else %}
                          <span class="star">★</span>
                        {% endif %}
                      {% endfor %}
                    </div>
                    <span class="review-count">{{ review_count }}</span>
                  </div>
                {% endif %}
              {% endif %}
              
              <!-- Variant Options (if enabled) -->
              {% if section.settings.show_variant_options and product.variants.size > 1 %}
                <div class="product-options" data-product-id="{{ product.id }}" data-product-handle="{{ product.handle }}">
                  {% for option in product.options_with_values %}
                    <div class="option-group">
                      <span class="option-label">{{ option.name }}:</span>
                      <div class="size-options">
                        {% for value in option.values %}
                          <button class="size-btn" 
                                  data-option-position="{{ option.position }}" 
                                  data-option-value="{{ value | escape }}"
                                  {% if forloop.first %}data-selected="true"{% endif %}>
                            {{ value }}
                          </button>
                        {% endfor %}
                      </div>
                    </div>
                  {% endfor %}
                </div>
              {% endif %}
              
              <!-- Add to Cart Button -->
              <div class="product-actions">
                {% if product.available %}
                  <div class="button-container">
                    <button class="add-to-cart-btn" 
                            data-product-id="{{ product.id }}"
                            data-current-variant="{{ product.variants.first.id }}"
                            onclick="addToCart(this, '{{ product.title | escape }}')">
                      <span>{{ section.settings.add_to_cart_text }}</span>
                      <span class="variant-price">
                        {% if product.compare_at_price > product.price %}
                          ${{ product.price | money_without_currency }}
                        {% else %}
                          ${{ product.price | money_without_currency }}
                        {% endif %}
                      </span>
                    </button>
                  </div>
                {% else %}
                  <div class="button-container">
                    <button class="add-to-cart-btn add-to-cart-btn--disabled" disabled>
                      {{ section.settings.out_of_stock_button_text }}
                    </button>
                  </div>
                {% endif %}
              </div>
            </div>
          </div>
        {% endfor %}
      </div>
      
      <button class="carousel-btn carousel-btn--next" onclick="scrollCarousel(1)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    
    <!-- Carousel Dots -->
    <div class="carousel-dots">
      {% for i in (1..6) %}
        <button class="dot {% if forloop.first %}dot--active{% endif %}" 
                onclick="goToSlide({{ forloop.index0 }})"></button>
      {% endfor %}
    </div>
  </div>
</div>

<style>
.product-carousel-section {
  padding: 60px 0;
  background: #fff;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 80px; /* Increased padding to give space for arrows */
}

.section-title {
  text-align: center;
  font-size: 2rem; /* 32px */
  margin-bottom: 40px;
  color: #333;
  font-weight: 400;
}

.carousel-wrapper {
  position: relative;
  overflow: visible; /* Changed from hidden to visible */
  margin: 0 40px;
}

.product-carousel {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 20px 0;
}

.product-carousel::-webkit-scrollbar {
  display: none;
}

.product-card {
  flex: 0 0 280px;
  background: #fff;
  border-radius: 8px;
  position: relative;
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
}

.product-card:hover {
  transform: translateY(-5px);
}

.status-badge {
  position: absolute;
  top: 15px;
  left: 15px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  z-index: 2;
  letter-spacing: 0.5px;
}

.status-badge--new {
  background: {{ section.settings.new_badge_color | default: '#ff6b6b' }};
  color: white;
}

.status-badge--sale {
  background: {{ section.settings.sale_badge_color | default: '#ff9800' }};
  color: white;
}

.status-badge--out-of-stock {
  background: {{ section.settings.out_of_stock_badge_color | default: '#999' }};
  color: white;
}

.status-badge--editors-pick {
  background: {{ section.settings.editors_pick_badge_color | default: '#8bc34a' }};
  color: white;
}

.product-image {
  width: 100%;
  height: 300px;
  background: var(--gradient-base-background-3);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  color: #999;
  font-size: 0.9rem;
}

.product-info {
  padding: 0 10px 15px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.product-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 2px;
  color: #333;
  line-height: 1;
}

.product-description {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin-bottom: 2px;
  line-height: 1;

}

.product-mini-description{
    margin-block: 5px !important;
}

  .product-content{
    height: 100%;
  }
  
.rating {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
}

.stars {
  display: flex;
  gap: 2px;
}

.star {
  color: var(--color-border-dark);
  font-size: 1rem;
}

.star--filled {
  color: var(--color-star-rating);
}

.review-count {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.product-options {
  margin-bottom: 15px;
}

.option-group {
  margin-bottom: 8px;
}

.option-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
  display: block;
}

.size-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.size-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border-dark);
  background: var(--gradient-base-background-1);
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.size-btn:hover {
  border-color: #333;
}

.size-btn[data-selected="true"] {
  background: #333;
  color: white;
  border-color: #333;
}

.product-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.add-to-cart-btn {
  width: 100%;
  padding: 12px;
  background: {{ section.settings.button_color | default: '#333' }};
  color: {{ section.settings.button_text_color | default: 'white' }};
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  justify-content:space-between;
}

.add-to-cart-btn:hover {
  background: #555;
}

.add-to-cart-btn--disabled {
  background: #ccc;
  cursor: not-allowed;
}

.price {
  text-align: center;
  font-weight: 600;
}

.price-sale {
  color: #ff6b6b;
  margin-right: 8px;
}

.price-compare {
  color: var(--color-text-muted);
  text-decoration: line-through;
  font-size: 0.9rem;
}

.price-regular {
  color: #333;
}

.price-range {
  color: var(--color-text-secondary);
}

.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--gradient-base-background-1);
  border: 1px solid var(--color-border-dark);
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10; /* Increased z-index */
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1); /* Added shadow for visibility */
}

.carousel-btn:hover {
  background: var(--gradient-base-background-3);
  border-color: #333;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.carousel-btn--prev {
  left: -40px;
}

.carousel-btn--next {
  right: -40px;
}

.carousel-dots {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 30px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ddd;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;
}

.dot--active {
  background: #333;
}

@media (max-width: 768px) {
  .product-card {
    flex: 0 0 250px;
  }
  
  .carousel-btn {
    display: none;
  }
  
  .carousel-wrapper {
    margin: 0 20px;
  }
  
  .container {
    padding: 0 20px;
  }
  
  .section-title {
    font-size: 1.5rem; /* 24px */
  }
}
</style>

<script>
function scrollCarousel(direction) {
  const carousel = document.getElementById('productCarousel');
  const scrollAmount = 300;
  const newScrollPosition = carousel.scrollLeft + (direction * scrollAmount);
  
  carousel.scrollTo({
    left: newScrollPosition,
    behavior: 'smooth'
  });
  
  // Update active dot based on scroll position
  updateActiveDot(newScrollPosition);
}

function updateActiveDot(scrollPosition) {
  const cardWidth = 300; // card width + gap
  const currentSlide = Math.round(scrollPosition / cardWidth);
  const dots = document.querySelectorAll('.dot');
  
  dots.forEach((dot, index) => {
    dot.classList.toggle('dot--active', index === currentSlide);
  });
}

function goToSlide(index) {
  const carousel = document.getElementById('productCarousel');
  const cardWidth = 300; // card width + gap
  const scrollPosition = index * cardWidth;
  
  carousel.scrollTo({
    left: scrollPosition,
    behavior: 'smooth'
  });
  
  // Update active dot
  updateActiveDot(scrollPosition);
}

// Also listen for manual scrolling to update dots
document.addEventListener('DOMContentLoaded', function() {
  const carousel = document.getElementById('productCarousel');
  if (carousel) {
    carousel.addEventListener('scroll', function() {
      updateActiveDot(carousel.scrollLeft);
    });
  }
  
  // Initialize variant selection
  initializeVariantSelection();
});

function initializeVariantSelection() {
  // Add click handlers to variant buttons
  document.querySelectorAll('.size-btn').forEach(button => {
    button.addEventListener('click', function() {
      selectVariant(this);
    });
  });
}

function selectVariant(button) {
  const productOptions = button.closest('.product-options');
  const optionGroup = button.closest('.option-group');
  
  console.log('Variant button clicked:', button.getAttribute('data-option-value'));
  
  // Remove selected state from other buttons in the same option group
  optionGroup.querySelectorAll('.size-btn').forEach(btn => {
    btn.removeAttribute('data-selected');
  });
  
  // Add selected state to clicked button
  button.setAttribute('data-selected', 'true');
  
  console.log('Updated selection, now calling updateAddToCartButton');
  
  // Update the add to cart button with the correct variant
  updateAddToCartButton(productOptions);
}

function updateAddToCartButton(productOptions) {
  const productId = productOptions.getAttribute('data-product-id');
  const productCard = productOptions.closest('.product-card');
  const addToCartBtn = productCard.querySelector('.add-to-cart-btn');
  
  // Get selected options
  const selectedOptions = [];
  productOptions.querySelectorAll('.size-btn[data-selected="true"]').forEach(btn => {
    selectedOptions[btn.getAttribute('data-option-position') - 1] = btn.getAttribute('data-option-value');
  });
  
  console.log('Selected options:', selectedOptions);
  
  // Fetch and update variant immediately
  fetchVariantId(productId, selectedOptions).then(variantId => {
    if (variantId) {
      console.log('Setting variant ID:', variantId);
      addToCartBtn.setAttribute('data-current-variant', variantId);
    } else {
      console.log('No matching variant found');
    }
  });
}

function addToCart(button, productTitle) {
  const variantId = button.getAttribute('data-current-variant');
  
  // Debug: Show what variant we're trying to add
  console.log('Attempting to add variant ID:', variantId);
  console.log('Button element:', button);
  console.log('All button attributes:', button.attributes);
  
  if (!variantId) {
    alert('Please select all options');
    return;
  }
  
  // Store original content safely
  const originalText = button.innerHTML;
  const priceElement = button.querySelector('.variant-price');
  const originalPrice = priceElement ? priceElement.textContent : '';
  
  // Update button to show loading state
  button.innerHTML = '<span>Adding...</span>' + (originalPrice ? '<span class="variant-price">' + originalPrice + '</span>' : '');
  button.disabled = true;
  
  // Get cart element (cart-drawer or cart-notification)
  const cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
  
  // Prepare form data like the theme does
  const formData = new FormData();
  formData.append('id', variantId);
  formData.append('quantity', '1');
  
  if (cart) {
    // Add sections to render (same as theme's product-form does)
    formData.append(
      'sections',
      cart.getSectionsToRender().map((section) => section.id)
    );
    formData.append('sections_url', window.location.pathname);
    cart.setActiveElement(document.activeElement);
  }
  
  // Use the same fetch config as the theme
  const config = {
    method: 'POST',
    headers: {
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: formData
  };
  
  fetch(window.routes?.cart_add_url || '/cart/add', config)
    .then((response) => response.json())
    .then((response) => {
      if (response.status) {
        // Handle error response
        throw new Error(response.description || 'Error adding to cart');
      }
      
      if (!cart) {
        // No cart drawer, redirect to cart page
        window.location = window.routes?.cart_url || '/cart';
        return;
      }
      
      // Show success state
      button.innerHTML = '<span>Added!</span>' + (originalPrice ? '<span class="variant-price">' + originalPrice + '</span>' : '');
      
      // Use the exact same method as the theme
      cart.renderContents(response);
      
      // Force a small delay to ensure DOM is updated
      setTimeout(() => {
        // Remove empty class if it exists
        if (cart.classList.contains('is-empty')) {
          cart.classList.remove('is-empty');
        }
        
        // Ensure the cart drawer is properly opened - but catch any focus errors
        try {
          if (typeof cart.open === 'function') {
            cart.open();
          }
        } catch (focusError) {
          console.log('Cart drawer focus error (non-critical):', focusError);
          // Cart drawer should still be visible even with focus error
        }
      }, 100);
      
      // Reset button after delay
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
      }, 1500);
    })
    .catch((error) => {
      console.error('Add to cart error:', error);
      
      // Reset button on error
      button.innerHTML = originalText;
      button.disabled = false;
      
      // Show error message
      alert('Error adding to cart: ' + error.message);
    });
}

async function fetchVariantId(productId, selectedOptions) {
  try {
    const productHandle = getProductHandle(productId);
    
    console.log('Debug - Using product handle:', productHandle);
    
    const response = await fetch(`/products/${productHandle}.js`);
    
    if (!response.ok) {
      console.error('Product fetch failed with handle:', productHandle, 'Status:', response.status);
      return null;
    }
    
    const product = await response.json();
    return findMatchingVariant(product, selectedOptions);
    
  } catch (error) {
    console.error('Error fetching variant:', error);
    return null;
  }
}

function findMatchingVariant(product, selectedOptions) {
  console.log('Product variants:', product.variants);
  console.log('Looking for options:', selectedOptions);
  
  // Find variant that matches selected options
  for (let variant of product.variants) {
    let matches = true;
    for (let i = 0; i < selectedOptions.length; i++) {
      if (selectedOptions[i] && variant.options[i] !== selectedOptions[i]) {
        matches = false;
        break;
      }
    }
    console.log('Checking variant:', variant.options, 'matches:', matches, 'available:', variant.available);
    
    if (matches && variant.available) {
      // Update price display
      updatePriceDisplay(variant);
      console.log('Found matching variant:', variant.id);
      return variant.id;
    }
  }
  console.log('No matching available variant found');
  return null;
}

// Helper function to get product handle from product ID
function getProductHandle(productId) {
  // Get the product handle from the data attribute
  const productOptions = document.querySelector(`[data-product-id="${productId}"]`);
  
  console.log('Debug - Product ID:', productId);
  console.log('Debug - Product options element found:', productOptions);
  
  if (productOptions && productOptions.hasAttribute('data-product-handle')) {
    const handle = productOptions.getAttribute('data-product-handle');
    console.log('Debug - Found product handle:', handle);
    return handle;
  }
  
  console.log('Debug - No product handle found, generating from title');
  
  // Fallback: try to find from product title
  const productCard = productOptions ? productOptions.closest('.product-card') : null;
  if (productCard) {
    const productTitle = productCard.querySelector('.product-title').textContent.trim();
    const generatedHandle = productTitle.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    console.log('Debug - Generated handle from title:', generatedHandle);
    return generatedHandle;
  }
  
  console.log('Debug - Using product ID as fallback');
  return productId; // Last resort fallback
}

function updatePriceDisplay(variant) {
  // Update the price in the button
  const priceElement = document.querySelector(`[data-product-id="${variant.product_id}"] .variant-price`);
  if (priceElement && variant.price) {
    priceElement.textContent = `${(variant.price / 100).toFixed(2)}`;
  }
}

// Auto-scroll carousel
let currentSlide = 0;
const totalSlides = 6;

function autoScroll() {
  currentSlide = (currentSlide + 1) % totalSlides;
  goToSlide(currentSlide);
}

// Optional: Auto-scroll every 5 seconds
if ({{ section.settings.auto_scroll | json }}) {
  setInterval(autoScroll, {{ section.settings.auto_scroll_delay | times: 1000 }});
}
</script>

{% schema %}
{
  "name": "Product Carousel",
  "tag": "section",
  "class": "product-carousel-section",
  "settings": [
    {
      "type": "text",
      "id": "section_title",
      "label": "Section Title",
      "default": "Explore our bestsellers"
    },
    {
      "type": "collection",
      "id": "collection",
      "label": "Collection",
      "info": "Select the collection to display products from"
    },
    {
      "type": "range",
      "id": "products_limit",
      "label": "Number of products to show",
      "min": 4,
      "max": 20,
      "step": 1,
      "default": 10
    },
    {
      "type": "checkbox",
      "id": "show_ratings",
      "label": "Show product ratings",
      "default": true,
      "info": "Requires review metafields to be set up"
    },
    {
      "type": "text",
      "id": "rating_metafield_namespace",
      "label": "Rating metafield namespace",
      "default": "reviews",
      "info": "Namespace for rating metafield (e.g., 'reviews')"
    },
    {
      "type": "text",
      "id": "rating_metafield_key",
      "label": "Rating metafield key",
      "default": "rating",
      "info": "Key for rating metafield (e.g., 'rating')"
    },
    {
      "type": "text",
      "id": "review_count_metafield_key",
      "label": "Review count metafield key",
      "default": "count",
      "info": "Key for review count metafield (e.g., 'count')"
    },
    {
      "type": "checkbox",
      "id": "show_variant_options",
      "label": "Show variant options",
      "default": true,
      "info": "Display size/color options for products with variants"
    },
    {
      "type": "checkbox",
      "id": "auto_scroll",
      "label": "Enable auto-scroll",
      "default": false
    },
    {
      "type": "range",
      "id": "auto_scroll_delay",
      "label": "Auto-scroll delay (seconds)",
      "min": 3,
      "max": 10,
      "step": 1,
      "default": 5,
      "info": "Only applies if auto-scroll is enabled"
    },
    {
      "type": "header",
      "content": "Status Badge Settings"
    },
    {
      "type": "text",
      "id": "new_product_tag",
      "label": "Tag for 'NEW' products",
      "default": "new",
      "info": "Products with this tag will show a 'NEW' badge"
    },
    {
      "type": "text",
      "id": "editors_pick_tag",
      "label": "Tag for 'Editor's Pick' products",
      "default": "editors-pick",
      "info": "Products with this tag will show an 'Editor's Pick' badge"
    },
    {
      "type": "text",
      "id": "new_badge_text",
      "label": "NEW badge text",
      "default": "NEW"
    },
    {
      "type": "text",
      "id": "sale_badge_text",
      "label": "SALE badge text",
      "default": "SALE"
    },
    {
      "type": "text",
      "id": "out_of_stock_badge_text",
      "label": "Out of stock badge text",
      "default": "OUT OF STOCK"
    },
    {
      "type": "text",
      "id": "editors_pick_badge_text",
      "label": "Editor's Pick badge text",
      "default": "Editor's Pick"
    },
    {
      "type": "header",
      "content": "Button Settings"
    },
    {
      "type": "text",
      "id": "add_to_cart_text",
      "label": "Add to cart button text",
      "default": "ADD TO BAG"
    },
    {
      "type": "text",
      "id": "out_of_stock_button_text",
      "label": "Out of stock button text",
      "default": "OUT OF STOCK"
    },
    {
      "type": "header",
      "content": "Colors"
    },
    {
      "type": "color",
      "id": "new_badge_color",
      "label": "NEW badge color",
      "default": "#ff6b6b"
    },
    {
      "type": "color",
      "id": "sale_badge_color",
      "label": "SALE badge color",
      "default": "#ff9800"
    },
    {
      "type": "color",
      "id": "editors_pick_badge_color",
      "label": "Editor's Pick badge color",
      "default": "#8bc34a"
    },
    {
      "type": "color",
      "id": "out_of_stock_badge_color",
      "label": "Out of stock badge color",
      "default": "#999999"
    },
    {
      "type": "color",
      "id": "button_color",
      "label": "Button background color",
      "default": "#333333"
    },
    {
      "type": "color",
      "id": "button_text_color",
      "label": "Button text color",
      "default": "#ffffff"
    }
  ],
  "presets": [
    {
      "name": "Product Carousel",
      "settings": {
        "section_title": "Explore our bestsellers",
        "products_limit": 10,
        "show_ratings": true,
        "show_variant_options": true,
        "auto_scroll": false,
        "new_product_tag": "new",
        "editors_pick_tag": "editors-pick"
      }
    }
  ]
}
{% endschema %}