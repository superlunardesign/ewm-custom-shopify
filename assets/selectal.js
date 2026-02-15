var Selectal = function(selectStr) {
    // Create the necessary elements and structure
    var select = document.querySelector(selectStr);
    var options = select.querySelectorAll('option');

    this.selectGroup = document.createElement('div');
    this.selectGroup.className = "selectal-group";
    this.selectGroup.id = select.id + "-selectal";

    this.selectBtn = document.createElement('div');
    this.selectBtn.className = "selectal-btn";

    this.selectedItem = document.createElement('p');
    this.selectedItem.className = "selectal-selected-item";
    this.selectedItem.innerHTML = options[0].innerHTML;
    this.selectBtn.appendChild(this.selectedItem);

    this.arrow = document.createElement('span');
    this.arrow.className = "arrow-down";
    this.selectBtn.appendChild(this.arrow);
    this.selectGroup.appendChild(this.selectBtn);

    this.dropdown = document.createElement('div');
    this.dropdown.className = "selectal-dropdown selectal-hidden";

    for(var i=0;i<options.length;i++) {
        var option = document.createElement('p');
        option.className = "selectal-dropdown-option";
        option.id = options[i].value;
        option.innerHTML = options[i].innerHTML;
        this.dropdown.appendChild(option);
    }
    this.selectGroup.appendChild(this.dropdown);

    var selectId = select.id;
    this.input = document.createElement('input');
    this.input.type = "hidden";
    this.input.value = options[0].value;
    this.input.id = select.id;
    this.selectGroup.appendChild(this.input);

    // Finally, append this to where the select element was and add the event listeners
    select.parentNode.insertBefore(this.selectGroup, select.nextSibling);
    select.remove();
    this.options = addEventListeners(this);
}

function addEventListeners(selectal) {
    var options = document.querySelectorAll('.selectal-dropdown-option');
    selectal.selectBtn.addEventListener('click', function() {
        var dropdown = this.parentNode.querySelector('.selectal-dropdown');
        selectal.toggleDropdown();
    });

    for(var i=0;i<options.length;i++) {
        options[i].addEventListener('click', function() {
            var dropdown = this.parentNode;
            var selectGroup = dropdown.parentNode;
            var input = selectGroup.querySelector('input');
            var selectBtn = selectGroup.querySelector('.selectal-btn');
            var text = this.innerHTML;
            var selectedText = this.parentNode.parentNode.querySelector('.selectal-selected-item');
            selectedText.innerHTML = text;
            input.value = this.id;
            input.dispatchEvent(new Event('change'));
            selectal.closeDropdown();
        });
    }
    return options;
}

// Public functions
function toggleDropdown() {
    if(this.dropdown.classList.contains("selectal-hidden")) {
        this.dropdown.classList.remove("selectal-hidden");
        this.selectBtn.classList.add("no-bottom-radius");
        this.arrow.classList.remove("arrow-down");
        this.arrow.classList.add("arrow-up");
    } else {
        this.dropdown.classList.add("selectal-hidden");
        this.selectBtn.classList.remove("no-bottom-radius");
        this.arrow.classList.remove("arrow-up");
        this.arrow.classList.add("arrow-down");
    }
}

function isDropdownOpen() {
    return !this.dropdown.classList.contains("selectal-hidden");
}

function closeDropdown() {
    this.dropdown.classList.add("selectal-hidden");
    this.selectBtn.classList.remove("no-bottom-radius");
    this.arrow.classList.remove("arrow-up");
    this.arrow.classList.add("arrow-down");
}

function openDropdown() {
    this.dropdown.classList.remove("selectal-hidden");
    this.selectBtn.classList.add("no-bottom-radius");
    this.arrow.classList.remove("arrow-down");
    this.arrow.classList.add("arrow-up");
}

function addEventListener(event, fn) {
    this.input.addEventListener(event, fn);
}

function removeEventListener(event, fn) {
    this.input.removeEventListener(event, fn);
}

function getValue() {
    var value = this.input.value;
    return value;
}

function setValue(value) {
    for(var i = 0; i < this.options.length; i++) {
        var option = this.options[i];
        if(option.id == value) {
            this.input.value = value;
            var selectedText = option.parentNode.parentNode.querySelector('.selectal-selected-item');
            selectedText.innerHTML = option.innerHTML;
        }
    }
}

Selectal.prototype.toggleDropdown = toggleDropdown;
Selectal.prototype.addEventListener = addEventListener;
Selectal.prototype.removeEventListener = removeEventListener;
Selectal.prototype.isDropdownOpen = isDropdownOpen;
Selectal.prototype.closeDropdown = closeDropdown;
Selectal.prototype.openDropdown = openDropdown;
Selectal.prototype.getValue = getValue;
Selectal.prototype.setValue = setValue;
//module.exports = Selectal;