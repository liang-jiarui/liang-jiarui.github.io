# Liquid 4.0 (via github-pages / Jekyll 3.9) still calls String#tainted?,
# which Ruby 3.2+ removed. GitHub Pages is unaffected.
class Object
  def tainted?
    false
  end unless method_defined?(:tainted?)
end
