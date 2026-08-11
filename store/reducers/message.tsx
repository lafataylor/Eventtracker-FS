import { SET_MESSAGE, CLEAR_MESSAGE } from '../actions/type'

export interface StateProps {
  message?: string
}

export const initialState: StateProps = {
  message: '',
}

function reducer(state = initialState, action: any) {
  const { type, payload } = action

  switch (type) {
    case SET_MESSAGE:
      return { message: payload }

    case CLEAR_MESSAGE:
      return { message: '' }

    default:
      return state
  }
}

export default { initialState, reducer }
