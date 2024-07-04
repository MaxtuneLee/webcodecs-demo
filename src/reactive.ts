import { render } from "./main";

export const useReactive = <T extends object>(obj: T): T => {
	const wrapper = { obj };
	return new Proxy(wrapper, {
		get(target) {
			return target.obj;
		},
		set(target, _, value) {
			target.obj = value;
			render();
			return true;
		},
	}) as T;
};
