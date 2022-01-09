let doc = {
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
          layout: {
            top: 0,
            left: 0,
            width: undefined,
            height: undefined,
            color: "red",
          },
        },
      ],
      attributes: { id: "hello", style: "background: green;" },
      computedStyle: { color: "red", background: "green" },
      layout: {
        top: 0,
        left: 0,
        width: undefined,
        height: undefined,
        color: "red",
      },
    },
  ],
  attributes: {},
  computedStyle: { color: "black" },
  layout: {
    top: 0,
    left: 0,
    width: undefined,
    height: undefined,
    color: "black",
  },
};
