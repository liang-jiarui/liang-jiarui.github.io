# Liquid 4.0 (via github-pages / Jekyll 3.9) still calls String#tainted?
# and String#untaint, which Ruby 3.2+ removed. GitHub Pages is unaffected.
class Object
  def tainted?
    false
  end unless method_defined?(:tainted?)

  def untaint
    self
  end unless method_defined?(:untaint)
end
