import { ModelAttributeBase } from './mattr-base';
import { createProjection } from './fn';
import { UI, ModelAttributeProperty as Prop, ClassName as CN } from '@src/global/enums.js';
import { valOrDefault, hasOwn, defProp } from '@zenkai/utils/datatype/index.js';
import { createDocFragment, insertBeforeElement, addClass, removeClass, createUl, createDiv, getElement } from '@zenkai/utils/dom/index.js';
import { createButtonNew, createButtonAdd, createButtonDelete } from '@utils/interactive.js';
import { enable, disable } from '@utils/effects.js';
import { InvalidModelError } from '@src/exception/index.js';
import { events } from '@utils/pubsub.js';

export const MultiValueAttribute = (function () {
    "use strict";

    const EL = UI.Element;
    const SEPARATOR = ',';

    var pub = ModelAttributeBase.create({
        init() {
            const self = this;

            var min = valOrDefault(this._source.multiple.min, 1);
            this._min = min;
            if (!hasOwn(this._source, Prop.VAL)) {
                if (min == 0 || this.isOptional) {
                    this._source.val = [];
                } else if (min > 0) {
                    this._source.val = [];
                    for (let i = 0; i < min; i++)
                        this._source.val.push(this.MODEL.createInstance(this._type));
                } else {
                    InvalidModelError.create("Unexpected value for the min property");
                }
            }

            this._isMultiple = true;
            this._represent = "";
            this.indexer = {};

            this._fnUpdate = function (val, index) { self.set(val, index); };
        },
        createProjection: function (val) {
            var projection = createProjection.call(this, val);
            projection.index = this.count - 1;
            return projection;
        },

        get fnMultiple() { return this._fnMultiple; },
        set fnMultiple(fn) { this._fnMultiple = fn; },

        get represent() { return this._represent; },
        set represent(val) { this._represent = val; },

        multiple_handler() { this.fnMultiple(); },

        render_attr() {
            const self = this;

            var M = this.MODEL;
            var container = createDocFragment();

            if (this.fnMultiple) {
                return this.fnMultiple();
            } else {
                let isComposedElement = M.hasComposition(this.type);
                if (!isComposedElement) {
                    if (this.isOptional) {
                        // create add button to add more item
                        let btnCreate = createButtonNew(this.name, function () {
                            self.eHTML = self.createContainer(isComposedElement);
                            insertBeforeElement(btnCreate, self.eHTML);
                            self.initValueHandler();
                            this.remove();
                        });
                        addClass(btnCreate, 'inline');
                        container.appendChild(btnCreate);

                        return container;
                    }
                }

                self.eHTML = self.createContainer(isComposedElement);
                container.appendChild(self.eHTML);
                self.initValueHandler();

                return container;
            }
        },
        initValueHandler() {
            var self = this;

            var M = self.MODEL;
            var len = self.value.length;

            if (len === 0) {
                // create add button to add more item
                let btnCreate = createButtonNew(self.name, btnCreate_Click);
                self.eHTML.appendChild(btnCreate);
            } else {
                for (let i = 0, last = len - 1; i < len; i++) {
                    self.eHTML.appendChild(self.handler(self._source, self.value[i], self.path, i === last));
                }
                self.postChange();

                if (M.isDataType(self.type) || M.isEnum(self.type)) {
                    let btnadd = createButtonAdd(function () {
                        var instance = M.createInstance(self.type);
                        self.add(instance);

                        // render
                        let li = (self.handler(self._source, instance, self.path));
                        insertBeforeElement(this, li);

                        let btnDelete = createButtonDelete(li, function () {
                            self.remove(self.count - 1);
                            events.emit('model.change', 'attribute:delete_clicked');
                        });
                        li.appendChild(btnDelete);

                        // focus on first element newly created
                        getElement(EL.ATTRIBUTE.toClass(), li).focus();
                    });
                    self.eHTML.appendChild(btnadd);
                }
            }

            function btnCreate_Click() {
                self.add(M.createInstance(self.type));

                var lastIndex = self.count - 1;
                var children = self.handler(self._source, self.value[lastIndex], self.path);
                var parent = this.parentElement;
                parent.appendChild(children);
                removeClass(parent, UI.EMPTY);
                this.remove();
            }
        },
        createContainer(isComposedElement) {
            if (isComposedElement) return createDiv({ class: 'attr-container' });

            var M = this.MODEL;

            var ul = createUl({
                class: 'bare-list ' + (M.isElement(this.type) && M.getModelElement(this.type).extensions ?
                    "list empty" : "array")
            });

            if (this._source.inline === false) addClass(ul, "block");
            Object.assign(ul.dataset, { multiple: true });
            if (this.representation) {
                var surround = this.representation.val.split("$val");
                Object.assign(ul.dataset, { before: surround[0], after: surround[1] });
            }

            return ul;
        },
        get(index) { return this._source.val[index]; },
        getIndex(val) { return this._source.val.indexOf(val); },
        getElement(index) { return index < 0 ? this.elements[this.elements.length + index] : this.elements[index]; },
        set(val, index, el) {

            if (this._source.val[index] !== val) {
                this._source.val[index] = val;
                events.emit('model.change', 'ModelAttributeMultivalue[l.405]:set');
            }

            if (el) {
                this.elements[index] = el;
            }
        },
        /**
         * Adds an element to the value of the attribute.
         * @param {object} val 
         */
        add(val) {
            this._source.val.push(val);
            events.emit('model.change', 'ModelAttributeMultivalue[l.416]:add');
            this.postChange();

            return this.count;
        },
        /**
         * Removes an element from the value of the attribute at the specified index.
         * @param {number} index 
         */
        remove(index) {
            if (index > -1) {
                if (this.projections[index]) this.projections.splice(index, 1)[0].remove();
                if (this.elements[index]) this.elements.splice(index, 1)[0].remove();
                this._source.val.splice(index, 1);
            } else {
                this.removeAll();
            }

            this.postChange();
            var isLast = this._source.val ? this.count === 0 : false;
            if (this.name === 'category' && this.multiplicity.min > 0 && isLast) {
                var instance = this.MODEL.createInstance(this.type);
                var mElem = this.MODEL.createModelElement(instance);
                this.eHTML.appendChild(this.handler(this._source, instance, this.path, true));
                this.set(instance, index, mElem);
            }

            return this;
        },
        /**
         * Removes every child elements and projections attached to this attribute.
         * @returns {ModelAttributeMultivalue}
         */
        removeAll() {
            this.projections.slice(0).forEach(function (projection) { projection.remove(); });
            this.elements.slice(0).forEach(function (el) { el.remove(); });

            // restore the source value to its initial state
            if (this._val !== undefined) {
                this.value = this._val;
            } else {
                delete this._source.val;
            }
            this.indexer = {};

            return this;
        },
        /**
         * This function is executed on every change made to the attribute value.
         */
        postChange() {
            const CLASS_BTN_DELETE = '.' + CN.BTN_DELETE;

            // Disable all delete buttons if the number of elements is 
            // lower or equal to the minimum required (specified in the model)
            var buttons = [];
            this.projections.forEach(function (p) { buttons.push(getElement(CLASS_BTN_DELETE, p.element)); });
            this.elements.forEach(function (el) { buttons.push(getElement(CLASS_BTN_DELETE, el.eHTML)); });
            var fn = this.min < this.count ? enable : disable;
            // Change the state (enabled|disabled) of the buttons found.
            buttons.filter(function (btn) { return btn !== undefined; }).forEach(function (btn) { fn(btn); });
        }
    });

    defProp(pub, 'count', {
        get() { return this._source.val ? this._source.val.length : 0; }
    });
    defProp(pub, 'multiplicity', {
        get() { return this._source.multiple; }
    });
    defProp(pub, 'separator', {
        get() { return valOrDefault(this.multiplicity.separator, SEPARATOR); }
    });
    defProp(pub, 'min', {
        get() { return this._min; }
    });

    return pub;
})();