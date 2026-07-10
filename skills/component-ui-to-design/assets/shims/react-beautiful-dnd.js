// react-beautiful-dnd shim. rbd drives its Draggable/Droppable via its OWN react-redux
// store; since the preview shims react-redux globally (app selectors → window.__APP_STATE__),
// rbd's connected Draggable gets undefined mapped props and throws `reading 'type'`, blanking
// the page as soon as a list has rows. A design card doesn't need real drag — render the
// rows statically by invoking the render-prop children with inert `provided`/`snapshot`.
const R = window.React;
const provided = {
    innerRef: () => {},
    draggableProps: {},
    dragHandleProps: {},
    droppableProps: {},
    placeholder: null,
};
const snapshot = { isDragging: false, isDraggingOver: false, draggingOver: null };
const render = (children) => (typeof children === 'function' ? children(provided, snapshot) : (children ?? null));

export const DragDropContext = ({ children }) => (children ?? null);
export const Droppable = ({ children }) => R.createElement(R.Fragment, null, render(children));
export const Draggable = ({ children }) => render(children);
export default { DragDropContext, Droppable, Draggable };
