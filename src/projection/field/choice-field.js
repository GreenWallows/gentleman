import {
    createDocFragment, createSpan, createDiv, createI, createInput, createUnorderedList,
    createListItem, findAncestor, isHTMLElement, removeChildren, isNullOrUndefined,
    isNullOrWhitespace, isObject, valOrDefault, hasOwn, capitalizeFirstLetter
} from "zenkai";
import { getElementBottom, getElementLeft, getElementRight, getElementTop, hide, isHidden, show } from "@utils/index.js";
import { StyleHandler } from "./../style-handler.js";
import { ContentHandler } from "./../content-handler.js";
import { Field } from "./field.js";


const NotificationType = {
    INFO: "info",
    ERROR: "error"
};

/**
 * Creates a notification message
 * @param {string} type 
 * @param {string} message 
 * @returns {HTMLElement}
 */
function createNotificationMessage(type, message) {
    var element = createSpan({ class: ["notification-message", `notification-message--${type}`] }, message);

    if (Array.isArray(message)) {
        element.style.minWidth = `${Math.min(message[0].length * 0.5, 30)}em`;
    } else {
        element.style.minWidth = `${Math.min(message.length * 0.5, 30)}em`;
    }

    return element;
}

/**
 * Get the choice element
 * @param {HTMLElement} element 
 * @this {BaseChoiceField}
 * @returns {HTMLElement}
 */
function getItem(element) {
    const isValid = (el) => el.parentElement === this.choices;

    if (isValid(element)) {
        return element;
    }

    return findAncestor(element, isValid, 5);
}

/**
 * Get the choice element value
 * @param {HTMLElement} item
 * @returns {string} 
 */
function getItemValue(item) {
    return item.textContent;
}

const isSame = (val1, val2) => {
    if (isObject(val1)) {
        return val1.id === val2.id;
    }
    return val1 === val2;
};

const BaseChoiceField = {
    /** @type {string} */
    value: null,
    /** @type {string} */
    values: null,
    /** @type {HTMLElement} */
    choices: null,
    /** @type {HTMLInputElement} */
    input: null,
    /** @type {Map} */
    items: null,
    /** @type {HTMLElement} */
    selection: null,
    /** @type {HTMLElement} */
    selectionElement: null,
    /** @type {*[]} */
    content: null,


    init() {
        this.items = new Map();
        this.content = this.schema.content;
        // TODO: Add group support

        if (!hasOwn(this.schema, "choice")) {
            this.schema.choice = {};
        }
        if (!hasOwn(this.schema, "selection")) {
            this.schema.selection = {};
        }

        return this;
    },

    /**
     * Verifies that the field has a changes
     * @returns {boolean}
     */
    hasChanges() {
        return this.value !== this.selected;
    },
    reset() {
        // TODO: Get initial value
        this.setValue(null, true);
    },
    /**
     * Verifies that the field has a value
     * @returns {boolean}
     */
    hasValue() {
        return !isNullOrUndefined(this.value);
    },
    /**
     * Gets the input value
     * @returns {boolean}
     */
    getValue() {
        return this.selection;
    },
    setValue(value, update = false) {
        var response = null;

        if (update) {
            response = this.source.setValue(value);
        } else {
            if (isNullOrUndefined(value)) {
                removeChildren(this.selectionElement);
                this.selection = null;
            } else if (value.object === "concept") {
                const { template = {} } = this.schema.selection;

                let projection = this.model.createProjection(value, valOrDefault(template.tag, "choice-selection")).init();
                projection.parent = this.projection;

                this.setChoice(value);

                this.setSelection(projection.render());
            } else {
                this.setChoice(value);
            }

            response = {
                success: true
            };
        }

        this.errors = [];
        if (!response.success) {
            this.environment.notify(response.message, "error");
            this.errors.push(...response.errors);
        }

        this.value = value;

        this.refresh();
    },

    render() {
        const fragment = createDocFragment();

        const { choice, content, selection = {}, input = {}, style } = this.schema;

        if (!isHTMLElement(this.element)) {
            this.element = createDiv({
                id: this.id,
                class: ["field", "field--choice"],
                tabindex: -1,
                dataset: {
                    nature: "field",
                    view: "choice",
                    input: "",
                    id: this.id,
                }
            });

            StyleHandler(this.element, style);
        }

        if (!isHTMLElement(this.notification)) {
            this.notification = createDiv({
                class: ["field-notification", "hidden"],
                dataset: {
                    nature: "field-component",
                    view: "choice",
                    id: this.id,
                }
            });

            fragment.appendChild(this.notification);
        }

        if (!isHTMLElement(this.statusElement)) {
            this.statusElement = createI({
                class: ["field-status"],
                dataset: {
                    nature: "field-component",
                    view: "choice",
                    id: this.id,
                }
            });

            this.notification.appendChild(this.statusElement);
        }

        if (!isHTMLElement(this.messageElement)) {
            this.messageElement = createI({
                class: ["field-message", "hidden"],
                dataset: {
                    nature: "field-component",
                    view: "choice",
                    id: this.id,
                }
            });

            this.notification.appendChild(this.messageElement);
        }

        if (content) {

            content.forEach(element => {
                if (element.type === "input") {
                    const { placeholder, style, type } = valOrDefault(element.input, {});

                    this.input = createInput({
                        type: valOrDefault(type, "text"),
                        class: ["field--choice__input"],
                        placeholder: placeholder,
                        dataset: {
                            nature: "field-component",
                            view: "choice",
                            id: this.id,
                        }
                    });


                    if (this.disabled) {
                        this.element.classList.add("disabled");
                        this.input.disabled = true;
                    }

                    if (this.focusable) {
                        this.input.tabIndex = 0;
                    } else {
                        this.element.dataset.ignore = "all";
                        this.input.dataset.ignore = "all";
                    }

                    StyleHandler(this.input, style);

                    fragment.append(this.input);
                } else if (element.type === "choice") {
                    const { style } = valOrDefault(element.choice, {});

                    this.choices = createUnorderedList({
                        class: ["bare-list", "field--choice__choices"],
                        tabindex: -1,
                        dataset: {
                            nature: "field-component",
                            view: "choice",
                            id: this.id
                        }
                    });

                    StyleHandler(this.choices, style);

                    fragment.appendChild(this.choices);
                } else {
                    let content = ContentHandler.call(this, element);

                    fragment.appendChild(content);
                }
            });

        }

        if (!isHTMLElement(this.choices)) {
            const { style } = choice;

            this.choices = createUnorderedList({
                class: ["bare-list", "field--choice__choices"],
                tabindex: -1,
                dataset: {
                    nature: "field-component",
                    view: "choice",
                    id: this.id
                }
            });

            StyleHandler(this.choices, style);

            fragment.appendChild(this.choices);
        }

        if (!isHTMLElement(this.selectionElement)) {
            const { style } = selection;

            this.selectionElement = createDiv({
                class: ["field--choice__selection"],
                dataset: {
                    nature: "field-component",
                    view: "choice",
                    id: this.id
                }
            });

            StyleHandler(this.selectionElement, style);

            fragment.appendChild(this.selectionElement);
        }

        if (fragment.hasChildNodes()) {
            this.element.appendChild(fragment);
            this.bindEvents();
        }

        removeChildren(this.choices);

        this.values = this.source.getCandidates();
        this.values.forEach(value => {
            this.choices.appendChild(this.createChoiceOption(value));
        });

        if (this.source.hasValue()) {
            this.setValue(this.source.getValue());
        }

        this.refresh();

        return this.element;
    },
    focus(target) {
        if (this.input && !isHidden(this.input)) {
            this.input.focus();
        } else if (this.selection) {
            this.selection.focus();
        }

        return this;
    },
    focusIn() {
        this.focused = true;
        this.element.classList.add("active");

        //requery
        const fragment = createDocFragment();

        this.source.getCandidates()
            .filter(val => !this.values.some(value => value.id === val.id))
            .forEach(value => {
                fragment.append(this.createChoiceOption(value));
                this.values.push(value);
            });

        this.choices.append(fragment);

        return this;
    },
    focusOut() {
        if (this.readonly) {
            return;
        }

        if (this.input && isNullOrWhitespace(this.input.value)) {
            this.input.value = "";
        }

        if (this.messageElement) {
            hide(this.messageElement);
            removeChildren(this.messageElement);
        }

        if (this.input) {
            this.input.blur();
        }
        this.element.classList.remove("active");
        this.element.classList.remove("querying");

        if (isHTMLElement(this.selection)) {
            const { children } = this.choices;

            for (let i = 0; i < children.length; i++) {
                /** @type {HTMLElement} */
                const item = children[i];

                if (item === this.selection) {
                    show(item);
                    item.hidden = false;
                } else {
                    hide(item);
                    item.hidden = true;
                }
            }

            this.input.value = getItemValue(this.selection);
        }

        this.focused = false;

        return this;
    },
    enable() {
        this.input.disabled = false;
        this.input.tabIndex = 0;
        this.disabled = false;

        return this;
    },
    disable() {
        this.input.disabled = true;
        this.input.tabIndex = -1;
        this.disabled = true;

        return this;
    },
    refresh() {
        if (this.hasValue()) {
            this.element.classList.remove("empty");
        } else {
            this.element.classList.add("empty");
        }

        if (this.hasChanges()) {
            this.statusElement.classList.add("change");
        } else {
            this.statusElement.classList.remove("change");
        }

        this.element.classList.remove("querying");

        removeChildren(this.statusElement);

        if (this.hasError) {
            this.element.classList.add("error");
            if (this.input) {
                this.input.classList.add("error");
            }
            this.statusElement.classList.add("error");
            this.statusElement.appendChild(createNotificationMessage(NotificationType.ERROR, this.errors));
        } else {
            this.element.classList.remove("error");
            if (this.input) {
                this.input.classList.remove("error");
            }
            this.statusElement.classList.remove("error");
        }

        return this;
    },
    /**
     * Filters the list of choice using a query
     * @param {string} query 
     */
    filterChoice(query) {
        const { children } = this.choices;

        this.element.dataset.input = query.trim();

        if (isNullOrWhitespace(query)) {
            for (let i = 0; i < children.length; i++) {
                const item = children[i];

                show(item);
                item.hidden = false;
            }

            return;
        }

        this.element.classList.add("querying");

        let parts = query.trim().toLowerCase().replace(/\s+/g, " ").split(' ');

        for (let i = 0; i < children.length; i++) {
            const item = children[i];

            let value = getItemValue(item);

            let match = parts.some(q => value.toLowerCase().includes(q));

            if (match) {
                show(item);
                item.hidden = false;
            } else {
                hide(item);
                item.hidden = true;
            }
        }

        return true;
    },
    createChoiceOption(value) {
        const isConcept = isObject(value);

        const container = createListItem({
            class: ["field--choice__choice"],
            tabindex: 0,
            dataset: {
                nature: "field-component",
                view: "choice",
                id: this.id,
                type: isConcept ? "concept" : "value",
                value: isConcept ? value.id : value,
            }
        });

        const choiceSchema = this.content.find(c => c.type === "choice");
        const { template = {}, style } = choiceSchema.choice.option;

        if (isConcept) {
            let choiceProjection = this.model.createProjection(value, valOrDefault(template.tag, "choice")).init({ focusable: false });
            choiceProjection.parent = this.projection;

            const { context } = choiceProjection.getSchema();

            if (context) {
                for (const key in context) {
                    const value = context[key];
                    container.dataset[`choice${capitalizeFirstLetter(key)}`] = value;
                }
            }

            container.append(choiceProjection.render());
        } else {
            container.append(value.toString());
        }

        StyleHandler(container, style);

        this.items.set(value.id, container);

        return container;
    },
    setChoice(value) {
        const { children } = this.choices;

        const getValue = (item) => {
            const { type, value } = item.dataset;

            if (type === "concept") {
                return this.values.find(val => val.id === value);
            }

            if (type === "value") {
                return value;
            }
        };

        let found = false;
        for (let i = 0; i < children.length; i++) {
            /** @type {HTMLElement} */
            const item = children[i];

            if (isSame(getValue(item), value)) {
                item.classList.add("selected");
                item.dataset.selected = "selected";
                this.selection = item;

                show(item);

                found = true;
            } else {
                item.classList.remove("selected");
                delete item.dataset.selected;

                hide(item);
            }
        }

        if (found) {
            this.input.value = value.name;
        }

        return this;
    },
    setSelection(element) {
        removeChildren(this.selectionElement).appendChild(element);
    },

    /**
     * Handles the `space` command
     * @param {HTMLElement} target 
     */
    _spaceHandler(target) {
        const fragment = createDocFragment();

        this.source.getCandidates().forEach(value => {
            fragment.appendChild(this.createChoiceOption(value));
        });

        removeChildren(this.choices).appendChild(fragment);
        this.filterChoice(this.input.value);
        show(this.choices);
        this.element.classList.add("querying");

        this.messageElement.appendChild(createNotificationMessage(NotificationType.INFO, "Select an element from the list."));
        show(this.messageElement);
    },
    /**
     * Handles the `escape` command
     * @param {HTMLElement} target 
     */
    escapeHandler(target) {
        if (target === this.input) {
            let parent = findAncestor(target, (el) => el.tabIndex === 0);
            let element = this.environment.resolveElement(parent);

            element.focus(parent);

            return true;
        }

        this.input.focus();

        if (this.messageElement) {
            hide(this.messageElement);
        }
    },
    /**
     * Handles the `enter` command
     * @param {HTMLElement} target 
     */
    enterHandler(target) {
        const item = getItem.call(this, target);

        const getValue = (item) => {
            const { type, value } = item.dataset;

            if (type === "concept") {
                return this.values.find(val => val.id === value);
            }

            if (type === "value") {
                return value;
            }
        };

        if (isHTMLElement(item) && this.selection !== item) {
            this.setValue(getValue(item), true);
        }
    },
    /**
     * Handles the `backspace` command
     * @param {HTMLElement} target 
     */
    backspaceHandler(target) {
        const item = getItem.call(this, target);

        if (item) {
            this.input.focus();
        }
    },
    /**
     * Handles the `click` command
     * @param {HTMLElement} target 
     */
    clickHandler(target) {
        const item = getItem.call(this, target);

        const getValue = (item) => {
            const { type, value } = item.dataset;

            if (type === "concept") {
                return this.values.find(val => val.id === value);
            }

            if (type === "value") {
                return value;
            }
        };

        if (isHTMLElement(item) && this.selection !== item) {
            this.setValue(getValue(item), true);
            this.focusOut();
        }
    },
    /**
     * Handles the `arrow` command
     * @param {HTMLElement} target 
     */
    arrowHandler(dir, target) {
        if (target.parentElement === this.choices) {
            let closestItem = null;

            if (dir === "up") {
                closestItem = getElementTop(target, this.choices);
            } else if (dir === "down") {
                closestItem = getElementBottom(target, this.choices);
            } else if (dir === "left") {
                closestItem = getElementLeft(target, this.choices);
            } else if (dir === "right") {
                closestItem = getElementRight(target, this.choices);
            }

            if (isHTMLElement(closestItem)) {
                closestItem.focus();

                return true;
            }

            return this.arrowHandler(dir, target.parentElement);
        } else if (target.parentElement === this.element) {
            let closestItem = null;

            if (dir === "up") {
                closestItem = getElementTop(target, this.element);
            } else if (dir === "down") {
                closestItem = getElementBottom(target, this.element);
            } else if (dir === "left") {
                closestItem = getElementLeft(target, this.element);
            } else if (dir === "right") {
                closestItem = getElementRight(target, this.element);
            }

            if (isHTMLElement(closestItem)) {
                if (closestItem === this.choices && this.choices.hasChildNodes()) {
                    closestItem.children[0].focus();
                } else if (closestItem === this.selectionElement) {
                    closestItem.children[0].focus();
                } else {
                    closestItem.focus();
                }

                return true;
            }
        }

        if (this.parent) {
            return this.parent.arrowHandler(dir, this.element);
        }

        return false;
    },

    bindEvents() {
        this.element.addEventListener('input', (event) => {
            this.filterChoice(this.input.value);
        });
    },
};


export const ChoiceField = Object.assign(
    Object.create(Field),
    BaseChoiceField
);