import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money } from "../../utils/money";
import {
  filterProducts,
  formatProductOptionLabel,
  matchesFreeProductOption,
} from "../../utils/productPicker";
import { CRM_ROUTE_CHANGE_EVENT } from "../../utils/uiCleanup";

export default function ProductPicker({
  value,
  products,
  onChange,
  className = "",
  "data-testid": dataTestId,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [listPosition, setListPosition] = useState(null);

  const updateListPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const horizontalPadding = 8;
    const width = Math.min(rect.width, window.innerWidth - rect.left - horizontalPadding);
    const maxHeight = Math.min(280, window.innerHeight * 0.5);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flip = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    setListPosition({
      top: flip ? undefined : rect.bottom - 1,
      bottom: flip ? window.innerHeight - rect.top + 1 : undefined,
      left: rect.left,
      width: Math.max(width, 160),
      maxHeight,
      flip,
    });
  }, []);

  const selectedProduct = useMemo(
    () => (products || []).find((product) => String(product.id) === String(value)),
    [products, value]
  );

  const filteredProducts = useMemo(
    () => filterProducts(products, query),
    [products, query]
  );

  const showFreeOption = matchesFreeProductOption(query);

  const options = useMemo(() => {
    const entries = [];
    if (showFreeOption) {
      entries.push({ type: "free", id: "" });
    }
    filteredProducts.forEach((product) => {
      entries.push({ type: "product", id: product.id, product });
    });
    return entries;
  }, [filteredProducts, showFreeOption]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, showFreeOption]);

  useLayoutEffect(() => {
    if (!open) {
      setListPosition(null);
      return undefined;
    }

    updateListPosition();
    window.addEventListener("resize", updateListPosition);
    window.addEventListener("scroll", updateListPosition, true);
    return () => {
      window.removeEventListener("resize", updateListPosition);
      window.removeEventListener("scroll", updateListPosition, true);
    };
  }, [open, updateListPosition, options.length]);

  useEffect(
    () => () => {
      setOpen(false);
      setListPosition(null);
    },
    []
  );

  useEffect(() => {
    function closeOnRouteChange() {
      setOpen(false);
      setQuery("");
      setListPosition(null);
    }

    window.addEventListener(CRM_ROUTE_CHANGE_EVENT, closeOnRouteChange);
    return () => window.removeEventListener(CRM_ROUTE_CHANGE_EVENT, closeOnRouteChange);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (
        rootRef.current?.contains(event.target) ||
        listRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpen(false);
      setQuery("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  function openPicker() {
    setOpen(true);
    setQuery("");
    setHighlightIndex(0);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  function selectOption(option) {
    onChange(option?.id ?? "");
    closePicker();
    inputRef.current?.blur();
  }

  function handleInputChange(event) {
    setQuery(event.target.value);
    if (!open) setOpen(true);
  }

  function handleInputFocus() {
    openPicker();
  }

  function handleInputKeyDown(event) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      openPicker();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      inputRef.current?.blur();
      return;
    }

    if (!open || options.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectOption(options[highlightIndex]);
    }
  }

  const inputValue = open ? query : selectedProduct ? formatProductOptionLabel(selectedProduct, money) : "";

  const listNode =
    open && listPosition ? (
      <ul
        ref={listRef}
        id={listId}
        className={`product-picker__list product-picker__list--fixed${
          listPosition.flip ? " product-picker__list--above" : ""
        }`}
        role="listbox"
        style={{
          top: listPosition.top,
          bottom: listPosition.bottom,
          left: listPosition.left,
          width: listPosition.width,
          maxHeight: listPosition.maxHeight,
        }}
      >
        {options.length === 0 ? (
          <li className="product-picker__empty">Aucun produit trouvé</li>
        ) : (
          options.map((option, index) => {
            const isActive = index === highlightIndex;
            const label =
              option.type === "free"
                ? "Produit libre"
                : formatProductOptionLabel(option.product, money);

            return (
              <li
                key={option.type === "free" ? "free" : option.id}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={String(option.id) === String(value)}
                className={`product-picker__option${
                  isActive ? " product-picker__option--active" : ""
                }${option.type === "free" ? " product-picker__option--free" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {label}
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`product-picker${open ? " product-picker--open" : ""}${
        open && listPosition?.flip ? " product-picker--above" : ""
      }${className ? ` ${className}` : ""}`}
      data-testid={dataTestId}
    >
      <input
        ref={inputRef}
        type="text"
        className="product-picker__input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && options[highlightIndex]
            ? `${listId}-option-${highlightIndex}`
            : undefined
        }
        placeholder="Rechercher un produit…"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        autoComplete="off"
        spellCheck={false}
      />

      {listNode && createPortal(listNode, document.body)}
    </div>
  );
}
