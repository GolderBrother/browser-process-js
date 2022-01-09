let layout = {
  type: "element",
  tagName: "body",
  children: [
    {
      type: "element",
      tagName: "div",
      children: [
        {
          type: "text",
          text: "hello",
          tagName: "text",
          children: [],
          attributes: {},
          computedStyle: { color: "red" },
        },
      ],
      attributes: { id: "hello", style: "background: green;" },
      computedStyle: { color: "red", background: "green" },
    },
  ],
  attributes: {},
  computedStyle: { color: "black" },
};
